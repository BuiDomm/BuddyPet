use std::time::Duration;

use chrono::{DateTime, Utc};
use thiserror::Error;

use super::{ActivitySnapshot, FullscreenState, LogicalPoint, PowerMode, SessionState};

pub const ACTIVE_INPUT_WINDOW: Duration = Duration::from_secs(60);
pub const IDLE_RESET_WINDOW: Duration = Duration::from_secs(5 * 60);
const MAX_COUNTED_SAMPLE_GAP: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ActivityError {
    #[error("last-input activity is unsupported on this platform")]
    UnsupportedPlatform,
    #[error("the operating-system activity API failed: {0}")]
    Os(String),
    #[error("the operating-system activity API returned an invalid duration")]
    InvalidDuration,
}

/// Narrow platform seam used by the sampler. Implementations must only return
/// elapsed time; they must never record which key or pointer button was used.
pub trait LastInputProvider: Send + Sync + 'static {
    fn last_input_age(&self) -> Result<Duration, ActivityError>;
}

/// Conservative, read-only system-state probes. Platform implementations must
/// return `Unknown` when reliable detection is unavailable; they must not install
/// hooks, request Accessibility access or infer state from input contents.
pub trait SafetyStateProvider: Send + Sync + 'static {
    fn session_state(&self) -> SessionState;
    fn power_mode(&self) -> PowerMode;
    fn fullscreen_state(&self) -> FullscreenState;
    fn mouse_buttons_down(&self) -> bool;
}

/// Convenience API used by the shell's ten-second sampler. Pointer coordinates
/// remain shell-owned because Tauri already supplies them in logical units.
pub trait ActivityProvider: LastInputProvider + SafetyStateProvider {
    fn activity_snapshot(&self, pointer: Option<LogicalPoint>) -> ActivitySnapshot {
        let last_input_age_ms = self
            .last_input_age()
            .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
            .unwrap_or(u64::MAX);
        ActivitySnapshot {
            last_input_age_ms,
            session_state: self.session_state(),
            power_mode: self.power_mode(),
            fullscreen_state: self.fullscreen_state(),
            pointer,
            mouse_buttons_down: self.mouse_buttons_down(),
        }
    }
}

impl<T> ActivityProvider for T where T: LastInputProvider + SafetyStateProvider {}

/// Accumulates an active streak from privacy-preserving snapshots.
///
/// Samples with input younger than 60 seconds accrue time. A short interruption
/// preserves (but does not grow) the streak, and five minutes idle resets it.
/// Elapsed time per sample is capped so a suspended timer cannot manufacture a
/// long streak immediately after wake.
#[derive(Debug, Clone, Default)]
pub struct ActiveStreakTracker {
    streak: Duration,
    last_observed_at: Option<DateTime<Utc>>,
    previous_sample_active: bool,
}

impl ActiveStreakTracker {
    pub fn observe(&mut self, now: DateTime<Utc>, snapshot: &ActivitySnapshot) -> Duration {
        let input_age = Duration::from_millis(snapshot.last_input_age_ms);
        let active = input_age < ACTIVE_INPUT_WINDOW;

        let Some(previous_at) = self.last_observed_at.replace(now) else {
            self.previous_sample_active = active;
            if input_age >= IDLE_RESET_WINDOW {
                self.streak = Duration::ZERO;
            }
            return self.streak;
        };

        let Ok(mut elapsed) = now.signed_duration_since(previous_at).to_std() else {
            // A wall-clock correction must not add phantom activity.
            self.streak = Duration::ZERO;
            self.previous_sample_active = active;
            return self.streak;
        };

        if input_age >= IDLE_RESET_WINDOW {
            self.streak = Duration::ZERO;
            self.previous_sample_active = false;
            return self.streak;
        }

        if active && self.previous_sample_active {
            elapsed = elapsed.min(MAX_COUNTED_SAMPLE_GAP);
            self.streak = self.streak.saturating_add(elapsed);
        }
        self.previous_sample_active = active;
        self.streak
    }

    pub fn streak(&self) -> Duration {
        self.streak
    }

    pub fn reset(&mut self) {
        self.streak = Duration::ZERO;
        self.last_observed_at = None;
        self.previous_sample_active = false;
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeDelta;

    use super::*;
    use crate::core::{FullscreenState, PowerMode, SessionState};

    fn snapshot(age: Duration) -> ActivitySnapshot {
        ActivitySnapshot {
            last_input_age_ms: age.as_millis() as u64,
            session_state: SessionState::Active,
            power_mode: PowerMode::Normal,
            fullscreen_state: FullscreenState::None,
            pointer: None,
            mouse_buttons_down: false,
        }
    }

    #[test]
    fn active_samples_accrue_elapsed_time() {
        let at = DateTime::parse_from_rfc3339("2026-08-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let mut tracker = ActiveStreakTracker::default();
        tracker.observe(at, &snapshot(Duration::from_secs(1)));
        tracker.observe(
            at + TimeDelta::seconds(10),
            &snapshot(Duration::from_secs(1)),
        );
        assert_eq!(tracker.streak(), Duration::from_secs(10));
    }

    #[test]
    fn short_idle_pauses_but_long_idle_resets() {
        let at = Utc::now();
        let mut tracker = ActiveStreakTracker::default();
        tracker.observe(at, &snapshot(Duration::ZERO));
        tracker.observe(at + TimeDelta::seconds(10), &snapshot(Duration::ZERO));
        tracker.observe(
            at + TimeDelta::seconds(20),
            &snapshot(Duration::from_secs(90)),
        );
        assert_eq!(tracker.streak(), Duration::from_secs(10));
        tracker.observe(
            at + TimeDelta::seconds(30),
            &snapshot(Duration::from_secs(5 * 60)),
        );
        assert_eq!(tracker.streak(), Duration::ZERO);
    }

    #[test]
    fn delayed_timer_is_capped() {
        let at = Utc::now();
        let mut tracker = ActiveStreakTracker::default();
        tracker.observe(at, &snapshot(Duration::ZERO));
        tracker.observe(at + TimeDelta::minutes(3), &snapshot(Duration::ZERO));
        assert_eq!(tracker.streak(), MAX_COUNTED_SAMPLE_GAP);
    }
}
