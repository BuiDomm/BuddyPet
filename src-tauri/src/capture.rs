//! One-frame, memory-only capture used by immersive visual pranks.
//!
//! The module deliberately exposes no save-to-disk API. A successful command
//! returns raw RGBA bytes once through Tauri IPC; the webview uploads them to a
//! short-lived texture and drops them with the episode.

use std::{sync::mpsc, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use xcap::Monitor;

const MAX_WIDTH: u32 = 640;
const MAX_HEIGHT: u32 = 480;
const MAX_PHYSICAL_PIXELS: u64 = 1_500_000;
const MAX_SCREEN_PERCENT: u64 = 12;
const CAPTURE_TIMEOUT: Duration = Duration::from_millis(200);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureMonitor {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f32,
    pub primary: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRegionRequest {
    pub monitor_id: String,
    /// Absolute physical desktop coordinates. Signed values support monitors
    /// positioned to the left or above the primary display.
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub fn list_capture_monitors() -> Result<Vec<CaptureMonitor>, String> {
    Monitor::all()
        .map_err(redacted_capture_error)?
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            let x = monitor.x().map_err(redacted_capture_error)?;
            let y = monitor.y().map_err(redacted_capture_error)?;
            Ok(CaptureMonitor {
                id: monitor_key(x, y, index),
                // Avoid querying AppKit-owned display names from an IPC worker;
                // names are not needed for capture and are deliberately generic.
                name: format!("Display {}", index + 1),
                x,
                y,
                width: monitor.width().map_err(redacted_capture_error)?,
                height: monitor.height().map_err(redacted_capture_error)?,
                scale_factor: monitor.scale_factor().unwrap_or(1.0),
                primary: monitor.is_primary().unwrap_or(false),
            })
        })
        .collect()
}

#[tauri::command]
pub fn capture_region(request: CaptureRegionRequest) -> Result<Response, String> {
    let (sender, receiver) = mpsc::sync_channel(1);
    std::thread::Builder::new()
        .name("buddypet-one-frame-capture".into())
        .spawn(move || {
            let _ = sender.send(capture_region_inner(request));
        })
        .map_err(|_| "captureUnavailable".to_string())?;

    match receiver.recv_timeout(CAPTURE_TIMEOUT) {
        Ok(Ok(bytes)) => Ok(Response::new(bytes)),
        Ok(Err(error)) => Err(error),
        Err(mpsc::RecvTimeoutError::Timeout) => Err("captureTimedOut".into()),
        Err(mpsc::RecvTimeoutError::Disconnected) => Err("captureUnavailable".into()),
    }
}

fn capture_region_inner(request: CaptureRegionRequest) -> Result<Vec<u8>, String> {
    let monitors = Monitor::all().map_err(redacted_capture_error)?;
    let monitor = monitors
        .into_iter()
        .enumerate()
        .find_map(|(index, candidate)| {
            let x = candidate.x().ok()?;
            let y = candidate.y().ok()?;
            (monitor_key(x, y, index) == request.monitor_id).then_some(candidate)
        })
        .ok_or_else(|| "displayUnavailable".to_string())?;

    let monitor_width = monitor.width().map_err(redacted_capture_error)?;
    let monitor_height = monitor.height().map_err(redacted_capture_error)?;
    let monitor_x = monitor.x().map_err(redacted_capture_error)?;
    let monitor_y = monitor.y().map_err(redacted_capture_error)?;
    let (relative_x, relative_y) = validate_region(
        &request,
        monitor_x,
        monitor_y,
        monitor_width,
        monitor_height,
    )?;

    let image = monitor
        .capture_region(relative_x, relative_y, request.width, request.height)
        .map_err(redacted_capture_error)?;
    Ok(image.into_raw())
}

/// Matches the shell's monitor identifiers without exposing display names or
/// platform-specific handles to episode plans or logs. The index is accepted
/// for API stability but coordinates are the identity for the current topology.
pub fn monitor_key(x: i32, y: i32, _index: usize) -> String {
    format!("display:{x}:{y}")
}

/// Explicit permission probe used only after the onboarding button is pressed.
/// The single captured pixel is dropped immediately and never crosses IPC.
pub fn probe_capture_permission() -> Option<bool> {
    let (sender, receiver) = mpsc::sync_channel(1);
    std::thread::Builder::new()
        .name("buddypet-capture-permission".into())
        .spawn(move || {
            let granted = Monitor::all()
                .ok()
                .and_then(|monitors| monitors.into_iter().next())
                .and_then(|monitor| monitor.capture_region(0, 0, 1, 1).ok())
                .is_some();
            let _ = sender.send(granted);
        })
        .ok()?;
    receiver.recv_timeout(CAPTURE_TIMEOUT).ok()
}

fn validate_region(
    request: &CaptureRegionRequest,
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
) -> Result<(u32, u32), String> {
    if request.width == 0 || request.height == 0 {
        return Err("invalidCaptureRegion".into());
    }
    if request.width > MAX_WIDTH || request.height > MAX_HEIGHT {
        return Err("captureRegionTooLarge".into());
    }

    let pixels = u64::from(request.width) * u64::from(request.height);
    if pixels > MAX_PHYSICAL_PIXELS {
        return Err("captureRegionTooLarge".into());
    }

    let monitor_pixels = u64::from(monitor_width) * u64::from(monitor_height);
    if pixels.saturating_mul(100) > monitor_pixels.saturating_mul(MAX_SCREEN_PERCENT) {
        return Err("captureRegionTooLarge".into());
    }

    let relative_x = i64::from(request.x) - i64::from(monitor_x);
    let relative_y = i64::from(request.y) - i64::from(monitor_y);
    let relative_x = u32::try_from(relative_x).map_err(|_| "invalidCaptureRegion".to_string())?;
    let relative_y = u32::try_from(relative_y).map_err(|_| "invalidCaptureRegion".to_string())?;
    let right = relative_x
        .checked_add(request.width)
        .ok_or_else(|| "invalidCaptureRegion".to_string())?;
    let bottom = relative_y
        .checked_add(request.height)
        .ok_or_else(|| "invalidCaptureRegion".to_string())?;
    if right > monitor_width || bottom > monitor_height {
        return Err("invalidCaptureRegion".into());
    }

    Ok((relative_x, relative_y))
}

fn redacted_capture_error(_error: impl std::fmt::Display) -> String {
    // Capture backends can include window/display details in errors. Keep IPC
    // deliberately generic so no display metadata leaks into logs or telemetry.
    "captureUnavailable".into()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(width: u32, height: u32) -> CaptureRegionRequest {
        CaptureRegionRequest {
            monitor_id: "test".into(),
            x: 100,
            y: 100,
            width,
            height,
        }
    }

    #[test]
    fn accepts_bounded_small_region() {
        assert!(validate_region(&request(480, 270), 0, 0, 1920, 1080).is_ok());
    }

    #[test]
    fn rejects_more_than_twelve_percent_of_display() {
        assert_eq!(
            validate_region(&request(640, 480), 0, 0, 1280, 720),
            Err("captureRegionTooLarge".into())
        );
    }

    #[test]
    fn rejects_out_of_bounds_and_overflow() {
        let mut outside = request(320, 240);
        outside.x = 1800;
        assert_eq!(
            validate_region(&outside, 0, 0, 1920, 1080),
            Err("invalidCaptureRegion".into())
        );

        let mut overflow = request(320, 240);
        overflow.x = i32::MAX;
        assert_eq!(
            validate_region(&overflow, 0, 0, 1920, 1080),
            Err("invalidCaptureRegion".into())
        );
    }

    #[test]
    fn accepts_absolute_coordinates_on_a_negative_monitor() {
        let mut region = request(320, 180);
        region.x = -1_800;
        region.y = 100;
        assert_eq!(
            validate_region(&region, -1_920, 0, 1_920, 1_080),
            Ok((120, 100))
        );
    }
}
