//! Minimal operating-system adapters.
//!
//! These adapters intentionally expose only time since last input. Session,
//! fullscreen, power and pointer state are supplied by the window shell so this
//! module never installs hooks or reads input content.

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod fallback;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use fallback::NativeLastInputProvider;
#[cfg(target_os = "macos")]
pub use macos::NativeLastInputProvider;
#[cfg(target_os = "windows")]
pub use windows::NativeLastInputProvider;
