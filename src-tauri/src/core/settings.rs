use std::collections::HashSet;

use thiserror::Error;

use super::{PetId, SettingsV1, contracts::default_hotkey};

pub const SETTINGS_SCHEMA_VERSION: u16 = 1;
pub const MAX_HOTKEY_CHARACTERS: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum SettingsError {
    #[error("unsupported settings schema version {found}; expected {expected}")]
    UnsupportedSchema { found: u16, expected: u16 },
    #[error("at least one Buddy must be selected")]
    NoSelectedPets,
    #[error("quiet-hour minutes must be less than 1440")]
    InvalidQuietHours,
    #[error("sound volume must be in 0..=100; got {0}")]
    InvalidSoundVolume(u8),
    #[error("hotkey must contain between 1 and 128 characters")]
    InvalidHotkey,
}

impl SettingsV1 {
    pub fn validate(&self) -> Result<(), SettingsError> {
        if self.schema_version != SETTINGS_SCHEMA_VERSION {
            return Err(SettingsError::UnsupportedSchema {
                found: self.schema_version,
                expected: SETTINGS_SCHEMA_VERSION,
            });
        }
        if self.selected_pets.is_empty() {
            return Err(SettingsError::NoSelectedPets);
        }
        if self.quiet_hours.start_minute >= 1_440 || self.quiet_hours.end_minute >= 1_440 {
            return Err(SettingsError::InvalidQuietHours);
        }
        if self.sound_volume > 100 {
            return Err(SettingsError::InvalidSoundVolume(self.sound_volume));
        }
        let hotkey = self.hotkey.trim();
        if hotkey.is_empty() || hotkey.chars().count() > MAX_HOTKEY_CHARACTERS {
            return Err(SettingsError::InvalidHotkey);
        }
        Ok(())
    }

    /// Validates and removes duplicate pet identifiers while retaining the
    /// user's ordering (which is meaningful to deterministic pet selection).
    pub fn normalized(mut self) -> Result<Self, SettingsError> {
        self.hotkey = self.hotkey.trim().to_owned();
        if self.hotkey.is_empty() || self.hotkey.chars().count() > MAX_HOTKEY_CHARACTERS {
            self.hotkey = default_hotkey();
        }
        self.validate()?;
        let mut seen = HashSet::<PetId>::new();
        self.selected_pets.retain(|pet| seen.insert(*pet));
        Ok(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::{PetId, QuietHours};

    #[test]
    fn defaults_are_safe_and_valid() {
        let settings = SettingsV1::default();
        assert_eq!(settings.selected_pets, vec![PetId::Goat10]);
        assert!(!settings.sound);
        assert!(!settings.autostart);
        assert!(!settings.immersive_enabled);
        assert_eq!(settings.sound_volume, 70);
        assert_eq!(settings.hotkey, "Control+Alt+B");
        assert!(!settings.telemetry_enabled);
        assert!(settings.validate().is_ok());
    }

    #[test]
    fn normalization_is_stable() {
        let settings = SettingsV1 {
            selected_pets: vec![PetId::Shiba, PetId::Goat10, PetId::Shiba],
            ..SettingsV1::default()
        };
        assert_eq!(
            settings.normalized().unwrap().selected_pets,
            vec![PetId::Shiba, PetId::Goat10]
        );
    }

    #[test]
    fn quiet_hours_wrap_midnight() {
        let hours = QuietHours::default();
        assert!(hours.contains_minute(23 * 60));
        assert!(hours.contains_minute(7 * 60 + 59));
        assert!(!hours.contains_minute(8 * 60));
        assert!(!hours.contains_minute(12 * 60));
    }

    #[test]
    fn volume_outside_percentage_range_is_rejected() {
        let settings = SettingsV1 {
            sound_volume: 101,
            ..SettingsV1::default()
        };
        assert_eq!(
            settings.validate(),
            Err(SettingsError::InvalidSoundVolume(101))
        );
    }

    #[test]
    fn normalization_repairs_invalid_hotkeys_and_trims_valid_ones() {
        let empty = SettingsV1 {
            hotkey: "   ".into(),
            ..SettingsV1::default()
        };
        assert_eq!(empty.normalized().unwrap().hotkey, "Control+Alt+B");

        let overlong = SettingsV1 {
            hotkey: "x".repeat(MAX_HOTKEY_CHARACTERS + 1),
            ..SettingsV1::default()
        };
        assert_eq!(overlong.normalized().unwrap().hotkey, "Control+Alt+B");

        let padded = SettingsV1 {
            hotkey: "  Control+Shift+B  ".into(),
            ..SettingsV1::default()
        };
        assert_eq!(padded.normalized().unwrap().hotkey, "Control+Shift+B");
    }
}
