use chrono::{DateTime, NaiveDate, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::settings::SETTINGS_SCHEMA_VERSION;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "lowercase")]
pub enum Locale {
    #[default]
    Vi,
    En,
    Ko,
    Ja,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum PetId {
    Goat10,
    Camel7,
    MemeCat,
    Shiba,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub enum Tone {
    #[default]
    Kind,
    Sassy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub enum Intensity {
    Gentle,
    #[default]
    Playful,
    Chaos,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct QuietHours {
    pub enabled: bool,
    /// Minutes after local midnight, in `0..1440`.
    pub start_minute: u16,
    /// Minutes after local midnight, in `0..1440`.
    pub end_minute: u16,
}

impl Default for QuietHours {
    fn default() -> Self {
        Self {
            enabled: true,
            start_minute: 22 * 60,
            end_minute: 8 * 60,
        }
    }
}

impl QuietHours {
    /// Returns true when the supplied local wall-clock minute falls in the
    /// configured half-open interval. Equal start/end means a full-day quiet
    /// period; disabling the setting is the explicit way to turn it off.
    pub fn contains_minute(&self, minute: u16) -> bool {
        if !self.enabled {
            return false;
        }

        if self.start_minute == self.end_minute {
            return true;
        }

        if self.start_minute < self.end_minute {
            (self.start_minute..self.end_minute).contains(&minute)
        } else {
            minute >= self.start_minute || minute < self.end_minute
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub struct BehaviorToggles {
    pub fake_damage: bool,
    pub cover_content: bool,
    pub cursor_play: bool,
    pub sfx: bool,
}

impl Default for BehaviorToggles {
    fn default() -> Self {
        Self {
            fake_damage: true,
            cover_content: true,
            cursor_play: true,
            sfx: true,
        }
    }
}

fn default_settings_schema_version() -> u16 {
    SETTINGS_SCHEMA_VERSION
}

fn default_selected_pets() -> Vec<PetId> {
    vec![PetId::Goat10]
}

pub(crate) const fn default_sound_volume() -> u8 {
    70
}

pub(crate) fn default_hotkey() -> String {
    "Control+Alt+B".to_owned()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SettingsV1 {
    #[serde(default = "default_settings_schema_version")]
    pub schema_version: u16,
    #[serde(default)]
    pub locale: Locale,
    #[serde(default = "default_selected_pets")]
    pub selected_pets: Vec<PetId>,
    #[serde(default)]
    pub tone: Tone,
    #[serde(default)]
    pub intensity: Intensity,
    #[serde(default)]
    pub quiet_hours: QuietHours,
    #[serde(default)]
    pub immersive_enabled: bool,
    #[serde(default)]
    pub sound: bool,
    #[serde(default = "default_sound_volume")]
    pub sound_volume: u8,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default)]
    pub reduce_motion: bool,
    #[serde(default)]
    pub meeting_mode_until: Option<DateTime<Utc>>,
    #[serde(default)]
    pub behavior_toggles: BehaviorToggles,
    #[serde(default)]
    pub onboarding_completed: bool,
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
    #[serde(default)]
    pub telemetry_enabled: bool,
}

impl Default for SettingsV1 {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            locale: Locale::Vi,
            selected_pets: default_selected_pets(),
            tone: Tone::Kind,
            intensity: Intensity::Playful,
            quiet_hours: QuietHours::default(),
            immersive_enabled: false,
            sound: false,
            sound_volume: default_sound_volume(),
            autostart: false,
            reduce_motion: false,
            meeting_mode_until: None,
            behavior_toggles: BehaviorToggles::default(),
            onboarding_completed: false,
            hotkey: default_hotkey(),
            telemetry_enabled: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub enum SessionState {
    Active,
    Locked,
    Sleeping,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub enum PowerMode {
    #[default]
    Normal,
    BatterySaver,
    LowPower,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub enum FullscreenState {
    #[default]
    None,
    Fullscreen,
    Presentation,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
pub struct LogicalPoint {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogicalRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl LogicalRect {
    pub fn area(self) -> u64 {
        u64::from(self.width) * u64::from(self.height)
    }

    pub fn contains(self, point: LogicalPoint) -> bool {
        let right = i64::from(self.x) + i64::from(self.width);
        let bottom = i64::from(self.y) + i64::from(self.height);
        i64::from(point.x) >= i64::from(self.x)
            && i64::from(point.x) < right
            && i64::from(point.y) >= i64::from(self.y)
            && i64::from(point.y) < bottom
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSnapshot {
    pub id: String,
    pub work_area: LogicalRect,
    /// Scale factor multiplied by 100 (for example 150 means 1.5x).
    pub scale_factor_percent: u16,
    #[serde(default)]
    pub primary: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySnapshot {
    pub last_input_age_ms: u64,
    pub session_state: SessionState,
    pub power_mode: PowerMode,
    pub fullscreen_state: FullscreenState,
    #[serde(default)]
    pub pointer: Option<LogicalPoint>,
    #[serde(default)]
    pub mouse_buttons_down: bool,
}

impl Default for ActivitySnapshot {
    fn default() -> Self {
        Self {
            last_input_age_ms: u64::MAX,
            session_state: SessionState::Unknown,
            power_mode: PowerMode::Normal,
            fullscreen_state: FullscreenState::Unknown,
            pointer: None,
            mouse_buttons_down: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum EpisodeTrigger {
    FocusNudge,
    Random,
    Manual,
    Tutorial,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EpisodePlan {
    pub event_id: String,
    pub trigger: EpisodeTrigger,
    pub pet_id: PetId,
    pub action_id: String,
    pub monitor_id: String,
    pub anchor_rect: LogicalRect,
    #[serde(default)]
    pub capture_rect: Option<LogicalRect>,
    pub locale: Locale,
    pub tone: Tone,
    pub seed: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum TriggerTag {
    Focus,
    Random,
    Manual,
    Tutorial,
    Shared,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum BehaviorCategory {
    FakeDamage,
    CoverContent,
    CursorPlay,
    Ambient,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct HitRegion {
    pub pose: String,
    pub polygon: Vec<LogicalPoint>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DismissPolicy {
    pub first_click_relocates: bool,
    pub second_click_window_ms: u32,
    pub long_press_ms: u32,
}

impl Default for DismissPolicy {
    fn default() -> Self {
        Self {
            first_click_relocates: true,
            second_click_window_ms: 8_000,
            long_press_ms: 700,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ActionManifest {
    pub schema_version: u16,
    pub id: String,
    pub pet_ids: Vec<PetId>,
    pub trigger_tags: Vec<TriggerTag>,
    pub category: BehaviorCategory,
    pub duration_ms: u32,
    pub rive_artboard: String,
    pub state_machine: String,
    #[serde(default)]
    pub inputs: Vec<String>,
    #[serde(default)]
    pub markers: Vec<String>,
    #[serde(default)]
    pub hit_regions: Vec<HitRegion>,
    pub line_key: String,
    #[serde(default)]
    pub sfx_cue: Option<String>,
    #[serde(default)]
    pub dismiss_policy: DismissPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ActionCatalogV1 {
    pub schema_version: u16,
    pub actions: Vec<ActionManifest>,
}

impl ActionManifest {
    pub fn supports(&self, pet: PetId, trigger: EpisodeTrigger) -> bool {
        let tag = match trigger {
            EpisodeTrigger::FocusNudge => TriggerTag::Focus,
            EpisodeTrigger::Random => TriggerTag::Random,
            EpisodeTrigger::Manual => TriggerTag::Manual,
            EpisodeTrigger::Tutorial => TriggerTag::Tutorial,
        };
        self.pet_ids.contains(&pet)
            && (self.trigger_tags.contains(&tag) || self.trigger_tags.contains(&TriggerTag::Shared))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RendererEvent {
    Ready {
        event_id: String,
    },
    PoseChanged {
        event_id: String,
        pose: String,
    },
    Clicked {
        event_id: String,
    },
    Dragged {
        event_id: String,
        #[serde(default)]
        anchor: Option<LogicalRect>,
    },
    Petted {
        event_id: String,
    },
    Marker {
        event_id: String,
        marker: String,
    },
    Completed {
        event_id: String,
    },
    Failed {
        event_id: String,
        reason: String,
    },
}

impl RendererEvent {
    pub fn event_id(&self) -> &str {
        match self {
            Self::Ready { event_id }
            | Self::PoseChanged { event_id, .. }
            | Self::Clicked { event_id }
            | Self::Dragged { event_id, .. }
            | Self::Petted { event_id }
            | Self::Marker { event_id, .. }
            | Self::Completed { event_id }
            | Self::Failed { event_id, .. } => event_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeRecord {
    pub started_at: DateTime<Utc>,
    pub local_date: NaiveDate,
    pub trigger: EpisodeTrigger,
    pub pet_id: PetId,
    pub action_id: String,
    #[serde(default)]
    pub line_key: String,
    #[serde(default)]
    pub dismissed_early: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_wire_format_is_camel_case_and_privacy_safe() {
        let json = serde_json::to_value(SettingsV1::default()).unwrap();
        assert_eq!(json["schemaVersion"], 1);
        assert_eq!(json["selectedPets"], serde_json::json!(["goat10"]));
        assert_eq!(json["intensity"], "playful");
        assert_eq!(json["quietHours"]["startMinute"], 1_320);
        assert_eq!(json["immersiveEnabled"], false);
        assert_eq!(json["sound"], false);
        assert_eq!(json["soundVolume"], 70);
        assert_eq!(json["autostart"], false);
        assert_eq!(json["hotkey"], "Control+Alt+B");
        assert_eq!(json["telemetryEnabled"], false);
    }

    #[test]
    fn missing_settings_fields_receive_v1_defaults() {
        let settings: SettingsV1 = serde_json::from_value(serde_json::json!({})).unwrap();
        assert_eq!(settings, SettingsV1::default());
    }

    #[test]
    fn renderer_event_uses_stable_tagged_shape() {
        let json = serde_json::to_value(RendererEvent::PoseChanged {
            event_id: "episode-1".into(),
            pose: "cry".into(),
        })
        .unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "type": "poseChanged",
                "eventId": "episode-1",
                "pose": "cry"
            })
        );
    }
}
