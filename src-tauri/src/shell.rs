use std::{
    sync::{
        Mutex, MutexGuard,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use chrono::{DateTime, Local, Timelike, Utc};
use serde::{Deserialize, Serialize};
use tauri::{
    App, AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl,
    WebviewWindowBuilder,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutEvent, ShortcutState};

use crate::{
    capture,
    core::{
        ActionCatalogV1, ActionManifest, ActivityProvider, ActivitySnapshot, BehaviorDirector,
        DirectorCommand, DirectorContext, EpisodePlan, EpisodeTrigger, FullscreenState,
        JsonFileStore, LogicalPoint, LogicalRect, MonitorSnapshot, PersistedAppStateV1, PetId,
        RendererEvent, SessionState, SettingsStore, SettingsV1,
    },
    platform::NativeLastInputProvider,
};

const SETTINGS_WINDOW: &str = "settings";
const PET_WINDOW: &str = "pet-stage";
const EFFECT_WINDOW: &str = "effect-main";
const BUBBLE_WINDOW: &str = "bubble";
const DIRECTOR_TICK_SECONDS: u64 = 10;
const PET_HIT_POLL_MS: u64 = 20;

const EVENT_PLAN: &str = "buddy://episode-plan";
const EVENT_HIDE: &str = "buddy://hide";
const EVENT_DIRECTOR: &str = "buddy://director-command";
const EVENT_SNAPSHOT: &str = "buddy://snapshot";

pub struct DesktopState {
    inner: Mutex<DesktopRuntime>,
    store: JsonFileStore,
    capture_permission: Mutex<CapturePermission>,
    last_director_tick: Mutex<Instant>,
    last_session_state: Mutex<SessionState>,
    pet_menu_open: AtomicBool,
}

struct DesktopRuntime {
    director: BehaviorDirector,
    actions: Vec<ActionManifest>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
enum CapturePermission {
    Unknown,
    Granted,
    Denied,
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    paused: bool,
    muted: bool,
    active_episode: bool,
    active_streak_seconds: u64,
    next_episode_at: Option<DateTime<Utc>>,
    snoozed_until: Option<DateTime<Utc>>,
    daily_episode_count: usize,
    capture_permission: CapturePermission,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    settings: SettingsV1,
    runtime: RuntimeSnapshot,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionRequest {
    action: DesktopAction,
    #[serde(default)]
    duration_minutes: Option<u32>,
    #[serde(default)]
    pet_id: Option<String>,
    #[serde(default)]
    action_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum DesktopAction {
    Summon,
    Hide,
    Pause,
    Resume,
    Mute,
    Unmute,
    Meeting,
    Snooze,
    RequestCapture,
    PreviewSound,
    PreviewAction,
    LessOfThis,
    Quit,
}

impl DesktopState {
    fn lock(&self) -> Result<MutexGuard<'_, DesktopRuntime>, String> {
        self.inner.lock().map_err(|_| "stateUnavailable".into())
    }

    fn capture_permission(&self) -> CapturePermission {
        self.capture_permission
            .lock()
            .map(|permission| *permission)
            .unwrap_or(CapturePermission::Unavailable)
    }

    fn set_capture_permission(&self, permission: CapturePermission) {
        if let Ok(mut current) = self.capture_permission.lock() {
            *current = permission;
        }
    }

    fn snapshot(&self, runtime: &DesktopRuntime) -> AppSnapshot {
        let director = &runtime.director;
        AppSnapshot {
            settings: director.settings().clone(),
            runtime: RuntimeSnapshot {
                paused: director.runtime_state().paused,
                muted: !director.settings().sound,
                active_episode: director.active_plan().is_some(),
                active_streak_seconds: director.active_streak().as_secs(),
                next_episode_at: director.runtime_state().next_random_at,
                snoozed_until: director.runtime_state().snoozed_until,
                daily_episode_count: director
                    .runtime_state()
                    .episode_history
                    .iter()
                    .filter(|episode| episode.local_date == Local::now().date_naive())
                    .filter(|episode| {
                        matches!(
                            episode.trigger,
                            EpisodeTrigger::FocusNudge | EpisodeTrigger::Random
                        )
                    })
                    .count(),
                capture_permission: self.capture_permission(),
            },
        }
    }

    fn persist(&self, runtime: &DesktopRuntime) -> Result<(), String> {
        self.store
            .save(&PersistedAppStateV1 {
                settings: runtime.director.settings().clone(),
                runtime: runtime.director.runtime_state().clone(),
                ..PersistedAppStateV1::default()
            })
            .map_err(|_| "stateSaveFailed".into())
    }
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let app_data = app.path().app_data_dir()?;
    let store = JsonFileStore::new(app_data.join("state.json"));
    let persisted = store.load().unwrap_or_default();
    let action_catalog: ActionCatalogV1 =
        serde_json::from_str(include_str!("../../public/content/actions.v1.json"))?;
    let actions = action_catalog
        .actions
        .into_iter()
        .filter(|action| action.validate_structure().is_ok())
        .collect::<Vec<_>>();
    if actions.is_empty() {
        return Err(std::io::Error::other("no valid BuddyPet actions were packaged").into());
    }

    let director = BehaviorDirector::new(
        persisted.settings,
        persisted.runtime,
        Utc::now(),
        rand::random(),
    )?;
    let onboarding_completed = director.settings().onboarding_completed;
    let initial_hotkey = director.settings().hotkey.clone();
    app.manage(DesktopState {
        inner: Mutex::new(DesktopRuntime { director, actions }),
        store,
        capture_permission: Mutex::new(CapturePermission::Unknown),
        last_director_tick: Mutex::new(Instant::now()),
        last_session_state: Mutex::new(SessionState::Unknown),
        pet_menu_open: AtomicBool::new(false),
    });

    build_overlay_windows(app)?;
    build_tray(app)?;
    // A conflicting user/global shortcut must not prevent the background app
    // from starting; the settings screen can be used to choose another chord.
    let _ = register_hotkey(app.handle(), &initial_hotkey);

    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    if !onboarding_completed {
        show_settings(app.handle());
    }
    start_director_timer(app.handle().clone());
    start_hit_mask_timer(app.handle().clone());
    Ok(())
}

fn build_overlay_windows(app: &App) -> tauri::Result<()> {
    let transparent = tauri::window::Color(0, 0, 0, 0);
    let pet = WebviewWindowBuilder::new(
        app,
        PET_WINDOW,
        WebviewUrl::App("index.html?window=pet-stage".into()),
    )
    .title("BuddyPet")
    .inner_size(280.0, 220.0)
    .decorations(false)
    .transparent(true)
    .background_color(transparent)
    .shadow(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .focusable(false)
    .focused(false)
    .accept_first_mouse(true)
    .resizable(false)
    .visible(false)
    .build()?;
    pet.set_ignore_cursor_events(true)?;

    let effect = WebviewWindowBuilder::new(
        app,
        EFFECT_WINDOW,
        WebviewUrl::App("index.html?window=effect".into()),
    )
    .title("BuddyPet Effect")
    .inner_size(480.0, 270.0)
    .decorations(false)
    .transparent(true)
    .background_color(transparent)
    .shadow(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .focusable(false)
    .focused(false)
    .resizable(false)
    .visible(false)
    .build()?;
    effect.set_ignore_cursor_events(true)?;

    let bubble = WebviewWindowBuilder::new(
        app,
        BUBBLE_WINDOW,
        WebviewUrl::App("index.html?window=bubble".into()),
    )
    .title("BuddyPet Bubble")
    .inner_size(360.0, 150.0)
    .decorations(false)
    .transparent(true)
    .background_color(transparent)
    .shadow(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .focusable(false)
    .focused(false)
    .resizable(false)
    .visible(false)
    .build()?;
    bubble.set_ignore_cursor_events(true)?;
    Ok(())
}

fn build_tray(app: &App) -> tauri::Result<()> {
    let summon = MenuItem::with_id(app, "summon", "Summon Buddy", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide now", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", "Resume", true, None::<&str>)?;
    let meeting = MenuItem::with_id(app, "meeting", "Meeting Mode · 60 min", true, None::<&str>)?;
    let snooze_15 = MenuItem::with_id(app, "snooze15", "Snooze 15 min", true, None::<&str>)?;
    let snooze_30 = MenuItem::with_id(app, "snooze30", "Snooze 30 min", true, None::<&str>)?;
    let snooze_60 = MenuItem::with_id(app, "snooze60", "Snooze 60 min", true, None::<&str>)?;
    let snooze_today = MenuItem::with_id(app, "snoozeToday", "Snooze today", true, None::<&str>)?;
    let mute = MenuItem::with_id(app, "mute", "Mute", true, None::<&str>)?;
    let unmute = MenuItem::with_id(app, "unmute", "Unmute", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit BuddyPet", true, None::<&str>)?;
    let separator_one = PredefinedMenuItem::separator(app)?;
    let separator_two = PredefinedMenuItem::separator(app)?;
    let separator_three = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &summon,
            &hide,
            &separator_one,
            &pause,
            &resume,
            &meeting,
            &snooze_15,
            &snooze_30,
            &snooze_60,
            &snooze_today,
            &separator_two,
            &mute,
            &unmute,
            &separator_three,
            &settings,
            &quit,
        ],
    )?;

    let icon = app.default_window_icon().cloned();
    let mut tray = TrayIconBuilder::with_id("buddypet-tray")
        .menu(&menu)
        .tooltip("BuddyPet")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_tray_event(app, event.id().as_ref()));
    if let Some(icon) = icon {
        tray = tray.icon(icon).icon_as_template(cfg!(target_os = "macos"));
    }
    tray.build(app)?;
    Ok(())
}

fn handle_tray_event(app: &AppHandle, id: &str) {
    match id {
        "settings" => show_settings(app),
        "quit" => app.exit(0),
        "summon" => {
            let _ = perform_action_internal(
                app,
                ActionRequest {
                    action: DesktopAction::Summon,
                    duration_minutes: None,
                    pet_id: None,
                    action_id: None,
                },
            );
        }
        "hide" => {
            let _ = perform_action_internal(app, simple_action(DesktopAction::Hide));
        }
        "pause" => {
            let _ = perform_action_internal(app, simple_action(DesktopAction::Pause));
        }
        "resume" => {
            let _ = perform_action_internal(app, simple_action(DesktopAction::Resume));
        }
        "meeting" => {
            let _ = perform_action_internal(app, timed_action(DesktopAction::Meeting, 60));
        }
        "snooze15" => {
            let _ = perform_action_internal(app, timed_action(DesktopAction::Snooze, 15));
        }
        "snooze30" => {
            let _ = perform_action_internal(app, timed_action(DesktopAction::Snooze, 30));
        }
        "snooze60" => {
            let _ = perform_action_internal(app, timed_action(DesktopAction::Snooze, 60));
        }
        "snoozeToday" => {
            let local = Local::now();
            let remaining = 24 * 60 - (local.hour() * 60 + local.minute());
            let _ =
                perform_action_internal(app, timed_action(DesktopAction::Snooze, remaining.max(1)));
        }
        "mute" => {
            let _ = perform_action_internal(app, simple_action(DesktopAction::Mute));
        }
        "unmute" => {
            let _ = perform_action_internal(app, simple_action(DesktopAction::Unmute));
        }
        _ => {}
    }
}

fn simple_action(action: DesktopAction) -> ActionRequest {
    ActionRequest {
        action,
        duration_minutes: None,
        pet_id: None,
        action_id: None,
    }
}

fn timed_action(action: DesktopAction, duration_minutes: u32) -> ActionRequest {
    ActionRequest {
        action,
        duration_minutes: Some(duration_minutes),
        pet_id: None,
        action_id: None,
    }
}

fn register_hotkey(app: &AppHandle, hotkey: &str) -> Result<(), Box<dyn std::error::Error>> {
    app.global_shortcut().unregister_all()?;
    let hotkey = canonical_hotkey(hotkey);
    app.global_shortcut().on_shortcut(
        hotkey.as_str(),
        |app: &AppHandle, _shortcut, event: ShortcutEvent| {
            if event.state == ShortcutState::Pressed {
                emergency_hide(app);
            }
        },
    )?;
    Ok(())
}

fn canonical_hotkey(hotkey: &str) -> String {
    hotkey
        .replace(' ', "")
        .replace("Ctrl", "Control")
        .replace("Option", "Alt")
}

fn start_director_timer(app: AppHandle) {
    thread::Builder::new()
        .name("buddypet-director".into())
        .spawn(move || {
            loop {
                thread::sleep(Duration::from_secs(DIRECTOR_TICK_SECONDS));
                if let Ok(commands) = tick_director(&app) {
                    dispatch_commands(&app, commands);
                }
            }
        })
        .expect("failed to start BuddyPet director timer");
}

fn start_hit_mask_timer(app: AppHandle) {
    thread::Builder::new()
        .name("buddypet-hit-mask".into())
        .spawn(move || {
            let mut was_ignored = true;
            loop {
                thread::sleep(Duration::from_millis(PET_HIT_POLL_MS));
                let state = app.state::<DesktopState>();
                let active = state
                    .inner
                    .lock()
                    .map(|runtime| runtime.director.active_plan().is_some())
                    .unwrap_or(false);
                if !active {
                    if !was_ignored {
                        if let Some(window) = app.get_webview_window(PET_WINDOW) {
                            let _ = window.set_ignore_cursor_events(true);
                        }
                        was_ignored = true;
                    }
                    thread::sleep(Duration::from_millis(230));
                    continue;
                }

                let Some(window) = app.get_webview_window(PET_WINDOW) else {
                    continue;
                };
                let menu_open = state.pet_menu_open.load(Ordering::Relaxed);
                let inside = menu_open
                    || app
                        .cursor_position()
                        .and_then(|cursor| {
                            let origin = window.outer_position()?;
                            let size = window.inner_size()?;
                            let x = cursor.x - f64::from(origin.x);
                            let y = cursor.y - f64::from(origin.y);
                            let center_x = f64::from(size.width) * 0.5;
                            let center_y = f64::from(size.height) * 0.52;
                            let radius_x = f64::from(size.width) * 0.43;
                            let radius_y = f64::from(size.height) * 0.48;
                            let normalized = ((x - center_x) / radius_x).powi(2)
                                + ((y - center_y) / radius_y).powi(2);
                            Ok(normalized <= 1.0)
                        })
                        .unwrap_or(false);
                let should_ignore = !inside;
                if should_ignore != was_ignored {
                    let _ = window.set_ignore_cursor_events(should_ignore);
                    was_ignored = should_ignore;
                }
            }
        })
        .expect("failed to start BuddyPet hit-mask timer");
}

fn tick_director(app: &AppHandle) -> Result<Vec<DirectorCommand>, String> {
    let (now, local_date, local_minute, activity, monitors) = director_inputs(app);
    let state = app.state::<DesktopState>();
    let resumed = observe_resume(&state, activity.session_state);
    let mut runtime = state.lock()?;
    let DesktopRuntime { director, actions } = &mut *runtime;
    let mut commands = if resumed {
        director.mark_resumed(now)
    } else {
        Vec::new()
    };
    commands.extend(
        director
            .tick(&DirectorContext {
                now,
                local_date,
                local_minute,
                activity: &activity,
                monitors: &monitors,
                actions,
            })
            .map_err(|_| "directorUnavailable".to_string())?,
    );
    if !commands.is_empty() {
        state.persist(&runtime)?;
    }
    let _ = app.emit(EVENT_SNAPSHOT, state.snapshot(&runtime));
    Ok(commands)
}

fn observe_resume(state: &DesktopState, session: SessionState) -> bool {
    let woke_from_sleep = state
        .last_director_tick
        .lock()
        .map(|mut previous| {
            let delayed = previous.elapsed() > Duration::from_secs(DIRECTOR_TICK_SECONDS * 3);
            *previous = Instant::now();
            delayed
        })
        .unwrap_or(true);
    let session_transition = state
        .last_session_state
        .lock()
        .map(|mut previous| {
            let transition = *previous != session
                && (matches!(*previous, SessionState::Locked | SessionState::Sleeping)
                    || matches!(session, SessionState::Locked | SessionState::Sleeping));
            *previous = session;
            transition
        })
        .unwrap_or(true);
    woke_from_sleep || session_transition
}

fn director_inputs(
    app: &AppHandle,
) -> (
    DateTime<Utc>,
    chrono::NaiveDate,
    u16,
    ActivitySnapshot,
    Vec<MonitorSnapshot>,
) {
    let local = Local::now();
    let pointer = app.cursor_position().ok().map(|position| LogicalPoint {
        x: clamp_f64_to_i32(position.x),
        y: clamp_f64_to_i32(position.y),
    });
    let mut activity = NativeLastInputProvider.activity_snapshot(pointer);
    #[cfg(target_os = "macos")]
    {
        activity.fullscreen_state = macos_fullscreen_state(app);
    }
    let monitors = app
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            let position = monitor.position();
            let size = monitor.size();
            MonitorSnapshot {
                id: capture::monitor_key(position.x, position.y, index),
                work_area: LogicalRect {
                    x: position.x,
                    y: position.y,
                    width: size.width,
                    height: size.height,
                },
                scale_factor_percent: (monitor.scale_factor() * 100.0)
                    .round()
                    .clamp(1.0, f64::from(u16::MAX)) as u16,
                primary: index == 0,
            }
        })
        .collect();
    (
        local.with_timezone(&Utc),
        local.date_naive(),
        (local.hour() * 60 + local.minute()) as u16,
        activity,
        monitors,
    )
}

#[cfg(target_os = "macos")]
fn macos_fullscreen_state(app: &AppHandle) -> FullscreenState {
    fn on_main_thread() -> FullscreenState {
        let Some(marker) = objc2::MainThreadMarker::new() else {
            return FullscreenState::Unknown;
        };
        let Some(screen) = objc2_app_kit::NSScreen::mainScreen(marker) else {
            return FullscreenState::Unknown;
        };
        let frame = screen.frame();
        let visible = screen.visibleFrame();
        let tolerance = 1.0;
        let covers_entire_screen = (frame.origin.x - visible.origin.x).abs() <= tolerance
            && (frame.origin.y - visible.origin.y).abs() <= tolerance
            && (frame.size.width - visible.size.width).abs() <= tolerance
            && (frame.size.height - visible.size.height).abs() <= tolerance;
        if covers_entire_screen {
            // This intentionally also suppresses when both the menu bar and
            // Dock are auto-hidden: a false positive is safer than interrupting
            // a presentation or full-screen workspace.
            FullscreenState::Fullscreen
        } else {
            FullscreenState::None
        }
    }

    if objc2::MainThreadMarker::new().is_some() {
        return on_main_thread();
    }
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    if app
        .run_on_main_thread(move || {
            let _ = sender.send(on_main_thread());
        })
        .is_err()
    {
        return FullscreenState::Unknown;
    }
    receiver
        .recv_timeout(Duration::from_millis(100))
        .unwrap_or(FullscreenState::Unknown)
}

fn clamp_f64_to_i32(value: f64) -> i32 {
    value
        .round()
        .clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
}

fn dispatch_commands(app: &AppHandle, commands: Vec<DirectorCommand>) {
    for command in commands {
        match &command {
            DirectorCommand::Start { plan } => show_episode(app, plan),
            DirectorCommand::Hide { .. } => hide_episode(app),
            DirectorCommand::React {
                relocate_to: Some(rect),
                ..
            } => {
                if let Some(window) = app.get_webview_window(PET_WINDOW) {
                    let _ = window.set_position(PhysicalPosition::new(rect.x, rect.y));
                }
                let _ = app.emit(EVENT_DIRECTOR, &command);
            }
            DirectorCommand::Blocked { .. }
            | DirectorCommand::SetPhase { .. }
            | DirectorCommand::React { .. } => {
                let _ = app.emit(EVENT_DIRECTOR, &command);
            }
        }
    }
}

fn show_episode(app: &AppHandle, plan: &EpisodePlan) {
    if let Some(window) = app.get_webview_window(PET_WINDOW) {
        let _ = window.set_size(PhysicalSize::new(
            plan.anchor_rect.width,
            plan.anchor_rect.height,
        ));
        let _ = window.set_position(PhysicalPosition::new(
            plan.anchor_rect.x,
            plan.anchor_rect.y,
        ));
        let _ = window.emit(EVENT_PLAN, plan);
    }

    if let Some(window) = app.get_webview_window(BUBBLE_WINDOW) {
        let bubble_y = plan.anchor_rect.y.saturating_sub(132);
        let _ = window.set_position(PhysicalPosition::new(plan.anchor_rect.x, bubble_y));
        let _ = window.emit(EVENT_PLAN, plan);
    }

    if let Some(window) = app.get_webview_window(EFFECT_WINDOW) {
        let rect = plan.capture_rect.unwrap_or(plan.anchor_rect);
        let _ = window.set_size(PhysicalSize::new(rect.width, rect.height));
        let _ = window.set_position(PhysicalPosition::new(rect.x, rect.y));
        let _ = window.emit(EVENT_PLAN, plan);
    }

    // Capture happens while every overlay is still hidden. The effect webview
    // emits `captureReady` after its one-shot texture upload, or after selecting
    // the cartoon fallback, and only then are pixels placed above other apps.
    if plan.capture_rect.is_none() {
        reveal_episode(app);
    }
}

fn reveal_episode(app: &AppHandle) {
    for label in [EFFECT_WINDOW, BUBBLE_WINDOW, PET_WINDOW] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.show();
        }
    }
}

fn hide_episode(app: &AppHandle) {
    app.state::<DesktopState>()
        .pet_menu_open
        .store(false, Ordering::Relaxed);
    for label in [PET_WINDOW, EFFECT_WINDOW, BUBBLE_WINDOW] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.emit(EVENT_HIDE, ());
            let _ = window.hide();
            let _ = window.set_ignore_cursor_events(true);
        }
    }
}

fn finish_current_episode(
    runtime: &mut DesktopRuntime,
    now: DateTime<Utc>,
) -> Vec<DirectorCommand> {
    runtime
        .director
        .active_plan()
        .map(|plan| RendererEvent::Completed {
            event_id: plan.event_id.clone(),
        })
        .map(|event| runtime.director.handle_renderer_event(event, now))
        .unwrap_or_default()
}

fn emergency_hide(app: &AppHandle) {
    let state = app.state::<DesktopState>();
    let Ok(mut runtime) = state.lock() else {
        hide_episode(app);
        return;
    };
    let commands = runtime.director.emergency_hide(Utc::now());
    let _ = state.persist(&runtime);
    let snapshot = state.snapshot(&runtime);
    drop(runtime);
    if commands.is_empty() {
        hide_episode(app);
    } else {
        dispatch_commands(app, commands);
    }
    let _ = app.emit(EVENT_SNAPSHOT, snapshot);
}

fn show_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn get_app_snapshot(state: State<'_, DesktopState>) -> Result<AppSnapshot, String> {
    let runtime = state.lock()?;
    Ok(state.snapshot(&runtime))
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    state: State<'_, DesktopState>,
    settings: SettingsV1,
) -> Result<AppSnapshot, String> {
    let settings = settings
        .normalized()
        .map_err(|_| "invalidSettings".to_string())?;
    let (previous_autostart, previous_hotkey) = {
        let runtime = state.lock()?;
        (
            runtime.director.settings().autostart,
            runtime.director.settings().hotkey.clone(),
        )
    };

    if previous_autostart != settings.autostart {
        let result = if settings.autostart {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        };
        result.map_err(|_| "autostartUpdateFailed".to_string())?;
    }
    if previous_hotkey != settings.hotkey && register_hotkey(&app, &settings.hotkey).is_err() {
        let _ = register_hotkey(&app, &previous_hotkey);
        return Err("hotkeyUnavailable".into());
    }

    let mut runtime = state.lock()?;
    runtime
        .director
        .update_settings(settings, Utc::now())
        .map_err(|_| "invalidSettings".to_string())?;
    state.persist(&runtime)?;
    let snapshot = state.snapshot(&runtime);
    let _ = app.emit(EVENT_SNAPSHOT, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn complete_onboarding(
    app: AppHandle,
    state: State<'_, DesktopState>,
    mut settings: SettingsV1,
) -> Result<AppSnapshot, String> {
    settings.onboarding_completed = true;
    update_settings(app, state, settings)
}

#[tauri::command]
pub fn perform_app_action(app: AppHandle, request: ActionRequest) -> Result<AppSnapshot, String> {
    perform_action_internal(&app, request)
}

fn perform_action_internal(app: &AppHandle, request: ActionRequest) -> Result<AppSnapshot, String> {
    if matches!(request.action, DesktopAction::Quit) {
        app.exit(0);
    }
    if matches!(request.action, DesktopAction::RequestCapture) {
        let permission = match capture::probe_capture_permission() {
            Some(true) => CapturePermission::Granted,
            Some(false) => CapturePermission::Denied,
            None => CapturePermission::Unavailable,
        };
        let state = app.state::<DesktopState>();
        state.set_capture_permission(permission);
        let runtime = state.lock()?;
        return Ok(state.snapshot(&runtime));
    }

    let (now, local_date, local_minute, activity, monitors) = director_inputs(app);
    let state = app.state::<DesktopState>();
    let resumed = observe_resume(&state, activity.session_state);
    let mut runtime = state.lock()?;
    let _requested_content = (&request.pet_id, &request.action_id);
    let mut commands = if resumed {
        runtime.director.mark_resumed(now)
    } else {
        Vec::new()
    };
    commands.extend(match request.action {
        DesktopAction::Summon => start_requested_episode(
            &mut runtime,
            &request,
            false,
            now,
            local_date,
            local_minute,
            &activity,
            &monitors,
        )?,
        DesktopAction::PreviewAction => start_requested_episode(
            &mut runtime,
            &request,
            true,
            now,
            local_date,
            local_minute,
            &activity,
            &monitors,
        )?,
        DesktopAction::Hide => finish_current_episode(&mut runtime, now),
        DesktopAction::Pause => {
            let commands = finish_current_episode(&mut runtime, now);
            runtime.director.set_paused(true);
            commands
        }
        DesktopAction::Resume => {
            runtime.director.set_paused(false);
            Vec::new()
        }
        DesktopAction::Snooze => {
            let commands = finish_current_episode(&mut runtime, now);
            let minutes = request.duration_minutes.unwrap_or(30).clamp(1, 24 * 60);
            runtime
                .director
                .snooze_until(Some(now + chrono::TimeDelta::minutes(i64::from(minutes))));
            commands
        }
        DesktopAction::Meeting => {
            let commands = finish_current_episode(&mut runtime, now);
            let minutes = request.duration_minutes.unwrap_or(60).clamp(1, 24 * 60);
            runtime
                .director
                .set_meeting_mode_until(Some(now + chrono::TimeDelta::minutes(i64::from(minutes))));
            commands
        }
        DesktopAction::Mute => {
            let mut settings = runtime.director.settings().clone();
            settings.sound = false;
            runtime
                .director
                .update_settings(settings, now)
                .map_err(|_| "invalidSettings".to_string())?;
            Vec::new()
        }
        DesktopAction::Unmute => {
            let mut settings = runtime.director.settings().clone();
            settings.sound = true;
            runtime
                .director
                .update_settings(settings, now)
                .map_err(|_| "invalidSettings".to_string())?;
            Vec::new()
        }
        DesktopAction::LessOfThis => runtime.director.less_of_this(now),
        DesktopAction::PreviewSound | DesktopAction::RequestCapture | DesktopAction::Quit => {
            Vec::new()
        }
    });
    state.persist(&runtime)?;
    let snapshot = state.snapshot(&runtime);
    drop(runtime);
    dispatch_commands(app, commands);
    let _ = app.emit(EVENT_SNAPSHOT, &snapshot);
    Ok(snapshot)
}

#[allow(clippy::too_many_arguments)]
fn start_requested_episode(
    runtime: &mut DesktopRuntime,
    request: &ActionRequest,
    tutorial: bool,
    now: DateTime<Utc>,
    local_date: chrono::NaiveDate,
    local_minute: u16,
    activity: &ActivitySnapshot,
    monitors: &[MonitorSnapshot],
) -> Result<Vec<DirectorCommand>, String> {
    let requested_pet = request.pet_id.as_deref().and_then(parse_pet_id);
    let action_hint = request.action_id.as_deref();
    let filtered_actions = runtime
        .actions
        .iter()
        .filter(|action| {
            requested_pet.is_none_or(|pet| action.pet_ids.contains(&pet))
                && action_hint.is_none_or(|hint| {
                    action.id == hint || action.id.contains(&hint.to_ascii_lowercase())
                })
        })
        .cloned()
        .collect::<Vec<_>>();
    let original_settings = runtime.director.settings().clone();
    if let Some(pet) = requested_pet {
        let mut temporary = original_settings.clone();
        temporary.selected_pets = vec![pet];
        runtime
            .director
            .update_settings(temporary, now)
            .map_err(|_| "invalidSettings".to_string())?;
    }

    let actions = if filtered_actions.is_empty() {
        runtime.actions.as_slice()
    } else {
        filtered_actions.as_slice()
    };
    let context = DirectorContext {
        now,
        local_date,
        local_minute,
        activity,
        monitors,
        actions,
    };
    let result = if tutorial {
        runtime.director.start_tutorial(&context)
    } else {
        runtime.director.summon(&context)
    }
    .map_err(|_| "directorUnavailable".to_string());

    if requested_pet.is_some() {
        runtime
            .director
            .update_settings(original_settings, now)
            .map_err(|_| "invalidSettings".to_string())?;
    }
    result
}

fn parse_pet_id(value: &str) -> Option<PetId> {
    match value {
        "goat10" => Some(PetId::Goat10),
        "camel7" => Some(PetId::Camel7),
        "memeCat" => Some(PetId::MemeCat),
        "shiba" => Some(PetId::Shiba),
        _ => None,
    }
}

#[tauri::command]
pub fn get_window_context(state: State<'_, DesktopState>) -> Result<Option<EpisodePlan>, String> {
    let runtime = state.lock()?;
    Ok(runtime.director.active_plan().cloned())
}

#[tauri::command]
pub fn renderer_event(
    app: AppHandle,
    state: State<'_, DesktopState>,
    event: RendererEvent,
) -> Result<(), String> {
    let mut runtime = state.lock()?;
    let reveal = matches!(
        &event,
        RendererEvent::Marker { event_id, marker }
            if marker == "captureReady"
                && runtime
                    .director
                    .active_plan()
                    .is_some_and(|plan| plan.event_id == *event_id)
    );
    let commands = runtime.director.handle_renderer_event(event, Utc::now());
    let snapshot = (!commands.is_empty()).then(|| state.snapshot(&runtime));
    if !commands.is_empty() {
        state.persist(&runtime)?;
    }
    drop(runtime);
    if reveal {
        reveal_episode(&app);
    }
    dispatch_commands(&app, commands);
    if let Some(snapshot) = snapshot {
        let _ = app.emit(EVENT_SNAPSHOT, snapshot);
    }
    Ok(())
}

#[tauri::command]
pub fn emergency_hide_now(app: AppHandle) {
    emergency_hide(&app);
}

#[tauri::command]
pub fn set_pet_menu_open(state: State<'_, DesktopState>, open: bool) {
    state.pet_menu_open.store(open, Ordering::Relaxed);
}

pub fn handle_settings_close(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() == SETTINGS_WINDOW
        && let tauri::WindowEvent::CloseRequested { api, .. } = event
    {
        api.prevent_close();
        let _ = window.hide();
    }
}
