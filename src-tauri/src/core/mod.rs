//! Platform-independent BuddyPet domain logic.
//!
//! The core deliberately has no dependency on Tauri. The application shell owns
//! clocks, timers, windows and IPC, while this module owns validation and all
//! scheduling decisions. This makes safety rules deterministic and testable.

mod activity;
mod contracts;
mod manifest;
mod persistence;
mod scheduler;
mod settings;

pub use activity::{
    ActiveStreakTracker, ActivityError, ActivityProvider, LastInputProvider, SafetyStateProvider,
};
pub use contracts::*;
pub use manifest::{
    ACTION_CATALOG_SCHEMA_VERSION, ACTION_MANIFEST_SCHEMA_VERSION, ManifestError,
    validate_action_catalog,
};
pub use persistence::{
    APP_STATE_SCHEMA_VERSION, JsonFileStore, PersistedAppStateV1, PersistenceError,
    RUNTIME_STATE_SCHEMA_VERSION, RuntimeStateV1, SettingsStore,
};
pub use scheduler::{
    BehaviorDirector, DirectorCommand, DirectorContext, DirectorError, DirectorPhase,
    EpisodeOutcome, HideReason, PresetPolicy, ReactionKind, SafetyBlock,
};
pub use settings::{MAX_HOTKEY_CHARACTERS, SETTINGS_SCHEMA_VERSION, SettingsError};
