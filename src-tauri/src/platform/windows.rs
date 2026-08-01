use std::{mem::size_of, time::Duration};

use windows::Win32::{
    Foundation::RECT,
    Graphics::Gdi::{GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromWindow},
    System::StationsAndDesktops::{CloseDesktop, DESKTOP_READOBJECTS, OpenInputDesktop},
    System::{
        Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS},
        SystemInformation::GetTickCount64,
    },
    UI::{
        Input::KeyboardAndMouse::{
            GetAsyncKeyState, GetLastInputInfo, LASTINPUTINFO, VK_LBUTTON, VK_MBUTTON, VK_RBUTTON,
            VK_XBUTTON1, VK_XBUTTON2,
        },
        WindowsAndMessaging::{GetForegroundWindow, GetWindowRect, IsIconic},
    },
};

use crate::core::{
    ActivityError, FullscreenState, LastInputProvider, PowerMode, SafetyStateProvider, SessionState,
};

#[derive(Debug, Clone, Copy, Default)]
pub struct NativeLastInputProvider;

impl LastInputProvider for NativeLastInputProvider {
    fn last_input_age(&self) -> Result<Duration, ActivityError> {
        let mut info = LASTINPUTINFO {
            cbSize: size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };

        // SAFETY: `info` is initialized with the required struct size and is
        // exclusively borrowed for the duration of the Win32 call.
        let ok = unsafe { GetLastInputInfo(&mut info) };
        if !ok.as_bool() {
            return Err(ActivityError::Os("GetLastInputInfo returned FALSE".into()));
        }

        // LASTINPUTINFO stores the low 32 bits of the boot tick counter. A
        // wrapping subtraction handles the documented ~49.7-day rollover.
        let now_low = unsafe { GetTickCount64() } as u32;
        Ok(Duration::from_millis(u64::from(
            now_low.wrapping_sub(info.dwTime),
        )))
    }
}

impl SafetyStateProvider for NativeLastInputProvider {
    fn session_state(&self) -> SessionState {
        // Opening the current input desktop is a read-only secure-desktop probe.
        // It installs no hook and deliberately treats UAC/lock desktops alike.
        unsafe {
            match OpenInputDesktop(Default::default(), false, DESKTOP_READOBJECTS) {
                Ok(desktop) => {
                    let _ = CloseDesktop(desktop);
                    SessionState::Active
                }
                Err(_) => SessionState::Locked,
            }
        }
    }

    fn power_mode(&self) -> PowerMode {
        let mut status = SYSTEM_POWER_STATUS::default();
        // SAFETY: `status` is an initialized output buffer exclusively borrowed
        // by the synchronous Kernel32 query.
        match unsafe { GetSystemPowerStatus(&mut status) } {
            Ok(()) if status.SystemStatusFlag == 1 => PowerMode::BatterySaver,
            Ok(()) => PowerMode::Normal,
            Err(_) => PowerMode::Unknown,
        }
    }

    fn fullscreen_state(&self) -> FullscreenState {
        // SAFETY: all handles originate from Win32 and are used only for
        // synchronous bounds queries. No window is modified.
        unsafe {
            let foreground = GetForegroundWindow();
            if foreground.0.is_null() || IsIconic(foreground).as_bool() {
                return FullscreenState::Unknown;
            }

            let mut window_rect = RECT::default();
            if GetWindowRect(foreground, &mut window_rect).is_err() {
                return FullscreenState::Unknown;
            }
            let monitor = MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST);
            if monitor.0.is_null() {
                return FullscreenState::Unknown;
            }
            let mut monitor_info = MONITORINFO {
                cbSize: size_of::<MONITORINFO>() as u32,
                ..MONITORINFO::default()
            };
            if !GetMonitorInfoW(monitor, &mut monitor_info).as_bool() {
                return FullscreenState::Unknown;
            }

            if rect_covers_monitor(window_rect, monitor_info.rcMonitor) {
                FullscreenState::Fullscreen
            } else {
                FullscreenState::None
            }
        }
    }

    fn mouse_buttons_down(&self) -> bool {
        const DOWN_MASK: u16 = 0x8000;
        [VK_LBUTTON, VK_RBUTTON, VK_MBUTTON, VK_XBUTTON1, VK_XBUTTON2]
            .into_iter()
            .any(|button| {
                // SAFETY: this read-only Win32 query takes a virtual-key value
                // and does not install a hook or expose any input content.
                (unsafe { GetAsyncKeyState(i32::from(button.0)) } as u16 & DOWN_MASK) != 0
            })
    }
}

fn rect_covers_monitor(window: RECT, monitor: RECT) -> bool {
    // Account for a small invisible resize border on borderless windows. This
    // intentionally prefers false positives (suppressing a pet) over appearing
    // on top of a presentation or game.
    const TOLERANCE: i32 = 2;
    window.left <= monitor.left + TOLERANCE
        && window.top <= monitor.top + TOLERANCE
        && window.right >= monitor.right - TOLERANCE
        && window.bottom >= monitor.bottom - TOLERANCE
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fullscreen_bounds_allow_invisible_border_tolerance() {
        let monitor = RECT {
            left: -1_920,
            top: 0,
            right: 0,
            bottom: 1_080,
        };
        assert!(rect_covers_monitor(
            RECT {
                left: -1_921,
                top: -1,
                right: 1,
                bottom: 1_081,
            },
            monitor,
        ));
        assert!(!rect_covers_monitor(
            RECT {
                left: -1_920,
                top: 24,
                right: 0,
                bottom: 1_080,
            },
            monitor,
        ));
    }
}
