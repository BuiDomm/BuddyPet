use std::time::Duration;

use core_foundation_sys::{
    base::{CFGetTypeID, CFRelease, CFTypeRef, kCFAllocatorDefault},
    dictionary::{CFDictionaryGetValue, CFDictionaryRef},
    number::{CFBooleanGetTypeID, CFBooleanGetValue, CFBooleanRef},
    string::{CFStringCreateWithCString, kCFStringEncodingUTF8},
};

use crate::core::{
    ActivityError, FullscreenState, LastInputProvider, PowerMode, SafetyStateProvider, SessionState,
};

/// CoreGraphics' combined-session event source. This observes age only and does
/// not require an event tap or Input Monitoring permission.
const COMBINED_SESSION_STATE: i32 = 0;
const ANY_INPUT_EVENT: u32 = u32::MAX;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    #[link_name = "CGEventSourceSecondsSinceLastEventType"]
    fn seconds_since_last_event_type(state_id: i32, event_type: u32) -> f64;
    #[link_name = "CGEventSourceButtonState"]
    fn button_state(state_id: i32, button: u32) -> bool;
    #[link_name = "CGSessionCopyCurrentDictionary"]
    fn session_dictionary() -> CFDictionaryRef;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NativeLastInputProvider;

impl LastInputProvider for NativeLastInputProvider {
    fn last_input_age(&self) -> Result<Duration, ActivityError> {
        // SAFETY: this pure CoreGraphics query accepts value types, retains no
        // pointer and has no ownership contract.
        let seconds =
            unsafe { seconds_since_last_event_type(COMBINED_SESSION_STATE, ANY_INPUT_EVENT) };
        if !seconds.is_finite() || seconds.is_sign_negative() || seconds > u64::MAX as f64 {
            return Err(ActivityError::InvalidDuration);
        }
        Ok(Duration::from_secs_f64(seconds))
    }
}

impl SafetyStateProvider for NativeLastInputProvider {
    fn session_state(&self) -> SessionState {
        // CGSession exposes only a session flag here; no app, window or input
        // identity is read. Missing/invalid data is treated conservatively.
        const LOCK_KEY: &[u8] = b"CGSSessionScreenIsLocked\0";
        unsafe {
            let dictionary = session_dictionary();
            if dictionary.is_null() {
                return SessionState::Unknown;
            }
            let key = CFStringCreateWithCString(
                kCFAllocatorDefault,
                LOCK_KEY.as_ptr().cast(),
                kCFStringEncodingUTF8,
            );
            if key.is_null() {
                CFRelease(dictionary as CFTypeRef);
                return SessionState::Unknown;
            }
            let value = CFDictionaryGetValue(dictionary, key.cast());
            let state = if value.is_null() {
                SessionState::Unknown
            } else if CFGetTypeID(value as CFTypeRef) == CFBooleanGetTypeID() {
                if CFBooleanGetValue(value as CFBooleanRef) {
                    SessionState::Locked
                } else {
                    SessionState::Active
                }
            } else {
                SessionState::Unknown
            };
            CFRelease(key as CFTypeRef);
            CFRelease(dictionary as CFTypeRef);
            state
        }
    }

    fn power_mode(&self) -> PowerMode {
        PowerMode::Unknown
    }

    fn fullscreen_state(&self) -> FullscreenState {
        // Inspecting private active-space APIs would be brittle and risks App
        // Store/private-API issues. The host may override this from window events.
        FullscreenState::Unknown
    }

    fn mouse_buttons_down(&self) -> bool {
        // SAFETY: each call is a value-only CoreGraphics query. Buttons 0, 1 and
        // 2 are left, right and center respectively; no event tap is installed.
        unsafe {
            button_state(COMBINED_SESSION_STATE, 0)
                || button_state(COMBINED_SESSION_STATE, 1)
                || button_state(COMBINED_SESSION_STATE, 2)
        }
    }
}
