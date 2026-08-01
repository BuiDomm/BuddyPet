use std::{
    fs::{self, File, OpenOptions},
    io::{self, BufReader, BufWriter, Write},
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use super::{EpisodeRecord, SettingsError, SettingsV1};

pub const APP_STATE_SCHEMA_VERSION: u16 = 1;
pub const RUNTIME_STATE_SCHEMA_VERSION: u16 = 1;

fn app_state_schema_version() -> u16 {
    APP_STATE_SCHEMA_VERSION
}

fn runtime_state_schema_version() -> u16 {
    RUNTIME_STATE_SCHEMA_VERSION
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStateV1 {
    #[serde(default = "runtime_state_schema_version")]
    pub schema_version: u16,
    #[serde(default)]
    pub paused: bool,
    #[serde(default)]
    pub snoozed_until: Option<DateTime<Utc>>,
    #[serde(default)]
    pub cooldown_until: Option<DateTime<Utc>>,
    #[serde(default)]
    pub adaptive_downshift_until: Option<DateTime<Utc>>,
    #[serde(default)]
    pub next_random_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub episode_history: Vec<EpisodeRecord>,
    /// Oldest to newest; at most three entries are retained by the director.
    #[serde(default)]
    pub recent_dismissals: Vec<bool>,
}

impl Default for RuntimeStateV1 {
    fn default() -> Self {
        Self {
            schema_version: RUNTIME_STATE_SCHEMA_VERSION,
            paused: false,
            snoozed_until: None,
            cooldown_until: None,
            adaptive_downshift_until: None,
            next_random_at: None,
            episode_history: Vec::new(),
            recent_dismissals: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAppStateV1 {
    #[serde(default = "app_state_schema_version")]
    pub schema_version: u16,
    #[serde(default)]
    pub settings: SettingsV1,
    #[serde(default)]
    pub runtime: RuntimeStateV1,
}

impl Default for PersistedAppStateV1 {
    fn default() -> Self {
        Self {
            schema_version: APP_STATE_SCHEMA_VERSION,
            settings: SettingsV1::default(),
            runtime: RuntimeStateV1::default(),
        }
    }
}

impl PersistedAppStateV1 {
    pub fn validate(&self) -> Result<(), PersistenceError> {
        if self.schema_version != APP_STATE_SCHEMA_VERSION {
            return Err(PersistenceError::UnsupportedSchema {
                layer: "app",
                found: self.schema_version,
                expected: APP_STATE_SCHEMA_VERSION,
            });
        }
        if self.runtime.schema_version != RUNTIME_STATE_SCHEMA_VERSION {
            return Err(PersistenceError::UnsupportedSchema {
                layer: "runtime",
                found: self.runtime.schema_version,
                expected: RUNTIME_STATE_SCHEMA_VERSION,
            });
        }
        self.settings.validate()?;
        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum PersistenceError {
    #[error("failed to access persisted BuddyPet state: {0}")]
    Io(#[from] io::Error),
    #[error("persisted BuddyPet state is invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Settings(#[from] SettingsError),
    #[error("unsupported {layer} state schema version {found}; expected {expected}")]
    UnsupportedSchema {
        layer: &'static str,
        found: u16,
        expected: u16,
    },
}

pub trait SettingsStore: Send + Sync + 'static {
    fn load(&self) -> Result<PersistedAppStateV1, PersistenceError>;
    fn save(&self, state: &PersistedAppStateV1) -> Result<(), PersistenceError>;
}

#[derive(Debug, Clone)]
pub struct JsonFileStore {
    path: PathBuf,
}

impl JsonFileStore {
    /// `path` should be an application-data file, never a user document path.
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn backup_path(&self) -> PathBuf {
        self.path.with_extension("json.bak")
    }

    fn read_path(path: &Path) -> Result<PersistedAppStateV1, PersistenceError> {
        let reader = BufReader::new(File::open(path)?);
        let state: PersistedAppStateV1 = serde_json::from_reader(reader)?;
        state.validate()?;
        Ok(state)
    }
}

impl SettingsStore for JsonFileStore {
    fn load(&self) -> Result<PersistedAppStateV1, PersistenceError> {
        match Self::read_path(&self.path) {
            Ok(state) => Ok(state),
            Err(PersistenceError::Io(error)) if error.kind() == io::ErrorKind::NotFound => {
                // A backup can remain if Windows was interrupted between its two
                // rename operations. Recovering it is safer than silently losing
                // cooldown and consent state.
                match Self::read_path(&self.backup_path()) {
                    Ok(state) => Ok(state),
                    Err(PersistenceError::Io(backup_error))
                        if backup_error.kind() == io::ErrorKind::NotFound =>
                    {
                        Ok(PersistedAppStateV1::default())
                    }
                    Err(error) => Err(error),
                }
            }
            Err(error) => Err(error),
        }
    }

    fn save(&self, state: &PersistedAppStateV1) -> Result<(), PersistenceError> {
        state.validate()?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let temporary = self
            .path
            .with_extension(format!("json.tmp-{}", Uuid::new_v4()));
        let write_result = (|| -> Result<(), PersistenceError> {
            let file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)?;
            let mut writer = BufWriter::new(file);
            serde_json::to_writer_pretty(&mut writer, state)?;
            writer.write_all(b"\n")?;
            writer.flush()?;
            writer.get_ref().sync_all()?;

            replace_file(&temporary, &self.path, &self.backup_path())?;
            sync_parent_directory(self.path.parent())?;
            Ok(())
        })();

        if write_result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        write_result
    }
}

#[cfg(not(target_os = "windows"))]
fn sync_parent_directory(parent: Option<&Path>) -> io::Result<()> {
    if let Some(parent) = parent {
        File::open(parent)?.sync_all()?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn sync_parent_directory(_parent: Option<&Path>) -> io::Result<()> {
    // Windows does not support opening a directory through `std::fs::File`.
    // The file itself was already flushed above.
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn replace_file(temporary: &Path, destination: &Path, _backup: &Path) -> io::Result<()> {
    fs::rename(temporary, destination)
}

#[cfg(target_os = "windows")]
fn replace_file(temporary: &Path, destination: &Path, backup: &Path) -> io::Result<()> {
    if !destination.exists() {
        return fs::rename(temporary, destination);
    }

    if backup.exists() {
        fs::remove_file(backup)?;
    }
    fs::rename(destination, backup)?;
    match fs::rename(temporary, destination) {
        Ok(()) => {
            fs::remove_file(backup)?;
            Ok(())
        }
        Err(error) => {
            let _ = fs::rename(backup, destination);
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::{Intensity, Locale};

    #[test]
    fn missing_file_loads_privacy_safe_defaults() {
        let directory = tempfile::tempdir().unwrap();
        let store = JsonFileStore::new(directory.path().join("state.json"));
        let loaded = store.load().unwrap();
        assert_eq!(loaded.settings.locale, Locale::Vi);
        assert_eq!(loaded.settings.intensity, Intensity::Playful);
        assert!(!loaded.settings.sound);
    }

    #[test]
    fn state_round_trips_and_replaces_existing_file() {
        let directory = tempfile::tempdir().unwrap();
        let store = JsonFileStore::new(directory.path().join("state.json"));
        let mut state = PersistedAppStateV1::default();
        store.save(&state).unwrap();
        state.settings.locale = Locale::Ja;
        state.runtime.paused = true;
        store.save(&state).unwrap();
        assert_eq!(store.load().unwrap(), state);
    }

    #[test]
    fn invalid_schema_is_rejected_without_overwriting() {
        let directory = tempfile::tempdir().unwrap();
        let store = JsonFileStore::new(directory.path().join("state.json"));
        let state = PersistedAppStateV1 {
            schema_version: 99,
            ..PersistedAppStateV1::default()
        };
        assert!(matches!(
            store.save(&state),
            Err(PersistenceError::UnsupportedSchema { layer: "app", .. })
        ));
        assert!(!store.path().exists());
    }
}
