use std::time::Duration;

use crate::core::{
    ActivityError, FullscreenState, LastInputProvider, PowerMode, SafetyStateProvider, SessionState,
};

#[derive(Debug, Clone, Copy, Default)]
pub struct NativeLastInputProvider;

impl LastInputProvider for NativeLastInputProvider {
    fn last_input_age(&self) -> Result<Duration, ActivityError> {
        Err(ActivityError::UnsupportedPlatform)
    }
}

impl SafetyStateProvider for NativeLastInputProvider {
    fn session_state(&self) -> SessionState {
        SessionState::Unknown
    }

    fn power_mode(&self) -> PowerMode {
        PowerMode::Unknown
    }

    fn fullscreen_state(&self) -> FullscreenState {
        FullscreenState::Unknown
    }

    fn mouse_buttons_down(&self) -> bool {
        false
    }
}
