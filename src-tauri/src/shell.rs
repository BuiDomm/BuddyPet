use std::{
    sync::{
        Mutex, MutexGuard,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use chrono::{DateTime, Days, Local, TimeZone, Timelike, Utc};
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
        JsonFileStore, Locale, LogicalPoint, LogicalRect, MonitorSnapshot, PersistedAppStateV1,
        PetId, RendererEvent, SessionState, SettingsStore, SettingsV1,
    },
    platform::NativeLastInputProvider,
};

const SETTINGS_WINDOW: &str = "settings";
const PET_WINDOW: &str = "pet-stage";
const EFFECT_WINDOW: &str = "effect-main";
const BUBBLE_WINDOW: &str = "bubble";
const DIRECTOR_TICK_SECONDS: u64 = 10;
const PET_HIT_POLL_MS: u64 = 20;
const CAPTURE_REVEAL_WATCHDOG_MS: u64 = 300;
const EPISODE_WATCHDOG_MS: u64 = 12_000;
const REACTION_WATCHDOG_MS: u64 = 5_000;
const MAX_USER_PAUSE_MINUTES: u32 = 26 * 60;
const BUBBLE_WIDTH: u32 = 360;
const BUBBLE_HEIGHT: u32 = 124;
const BUBBLE_GAP: i32 = 14;

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
    pet_hit_polygon: Mutex<Vec<LogicalPoint>>,
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
    let initial_locale = director.settings().locale;
    app.manage(DesktopState {
        inner: Mutex::new(DesktopRuntime { director, actions }),
        store,
        capture_permission: Mutex::new(CapturePermission::Unknown),
        last_director_tick: Mutex::new(Instant::now()),
        last_session_state: Mutex::new(SessionState::Unknown),
        pet_menu_open: AtomicBool::new(false),
        pet_hit_polygon: Mutex::new(Vec::new()),
    });

    build_overlay_windows(app)?;
    build_tray(app, initial_locale)?;
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
    #[cfg(debug_assertions)]
    if std::env::args().any(|argument| argument == "--test-entrance") {
        debug_test_entrance(app.handle());
    }
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
    .inner_size(f64::from(BUBBLE_WIDTH), f64::from(BUBBLE_HEIGHT))
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

#[derive(Clone, Copy)]
struct TrayCopy {
    summon: &'static str,
    hide: &'static str,
    pause: &'static str,
    resume: &'static str,
    meeting: &'static str,
    snooze_15: &'static str,
    snooze_30: &'static str,
    snooze_60: &'static str,
    snooze_today: &'static str,
    mute: &'static str,
    unmute: &'static str,
    settings: &'static str,
    quit: &'static str,
}

fn tray_copy(locale: Locale) -> TrayCopy {
    match locale {
        Locale::Vi => TrayCopy {
            summon: "Gọi Buddy",
            hide: "Ẩn ngay",
            pause: "Tạm dừng",
            resume: "Tiếp tục",
            meeting: "Chế độ họp · 60 phút",
            snooze_15: "Yên lặng 15 phút",
            snooze_30: "Yên lặng 30 phút",
            snooze_60: "Yên lặng 60 phút",
            snooze_today: "Yên lặng hôm nay",
            mute: "Tắt âm thanh",
            unmute: "Bật âm thanh",
            settings: "Cài đặt…",
            quit: "Thoát BuddyPet",
        },
        Locale::En => TrayCopy {
            summon: "Summon Buddy",
            hide: "Hide now",
            pause: "Pause",
            resume: "Resume",
            meeting: "Meeting Mode · 60 min",
            snooze_15: "Snooze 15 min",
            snooze_30: "Snooze 30 min",
            snooze_60: "Snooze 60 min",
            snooze_today: "Snooze today",
            mute: "Mute",
            unmute: "Unmute",
            settings: "Settings…",
            quit: "Quit BuddyPet",
        },
        Locale::Ko => TrayCopy {
            summon: "Buddy 부르기",
            hide: "지금 숨기기",
            pause: "일시 정지",
            resume: "계속",
            meeting: "회의 모드 · 60분",
            snooze_15: "15분 동안 쉬기",
            snooze_30: "30분 동안 쉬기",
            snooze_60: "60분 동안 쉬기",
            snooze_today: "오늘은 쉬기",
            mute: "음소거",
            unmute: "음소거 해제",
            settings: "설정…",
            quit: "BuddyPet 종료",
        },
        Locale::Ja => TrayCopy {
            summon: "Buddyを呼ぶ",
            hide: "今すぐ隠す",
            pause: "一時停止",
            resume: "再開",
            meeting: "会議モード · 60分",
            snooze_15: "15分休む",
            snooze_30: "30分休む",
            snooze_60: "60分休む",
            snooze_today: "今日は休む",
            mute: "ミュート",
            unmute: "ミュート解除",
            settings: "設定…",
            quit: "BuddyPetを終了",
        },
    }
}

fn create_tray_menu(app: &AppHandle, locale: Locale) -> tauri::Result<Menu<tauri::Wry>> {
    let copy = tray_copy(locale);
    let summon = MenuItem::with_id(app, "summon", copy.summon, true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", copy.hide, true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", copy.pause, true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", copy.resume, true, None::<&str>)?;
    let meeting = MenuItem::with_id(app, "meeting", copy.meeting, true, None::<&str>)?;
    let snooze_15 = MenuItem::with_id(app, "snooze15", copy.snooze_15, true, None::<&str>)?;
    let snooze_30 = MenuItem::with_id(app, "snooze30", copy.snooze_30, true, None::<&str>)?;
    let snooze_60 = MenuItem::with_id(app, "snooze60", copy.snooze_60, true, None::<&str>)?;
    let snooze_today =
        MenuItem::with_id(app, "snoozeToday", copy.snooze_today, true, None::<&str>)?;
    let mute = MenuItem::with_id(app, "mute", copy.mute, true, None::<&str>)?;
    let unmute = MenuItem::with_id(app, "unmute", copy.unmute, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", copy.settings, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", copy.quit, true, None::<&str>)?;
    let separator_one = PredefinedMenuItem::separator(app)?;
    let separator_two = PredefinedMenuItem::separator(app)?;
    let separator_three = PredefinedMenuItem::separator(app)?;
    Menu::with_items(
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
    )
}

fn build_tray(app: &App, locale: Locale) -> tauri::Result<()> {
    let menu = create_tray_menu(app.handle(), locale)?;

    #[cfg(target_os = "macos")]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")).ok();
    #[cfg(not(target_os = "macos"))]
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

fn update_tray_locale(app: &AppHandle, locale: Locale) {
    if let (Some(tray), Ok(menu)) = (
        app.tray_by_id("buddypet-tray"),
        create_tray_menu(app, locale),
    ) {
        let _ = tray.set_menu(Some(menu));
    }
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
            let _ = perform_action_internal(
                app,
                timed_action(DesktopAction::Snooze, minutes_until_next_local_day(local)),
            );
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

fn minutes_until_next_local_day<Tz>(local: DateTime<Tz>) -> u32
where
    Tz: TimeZone,
    Tz::Offset: Copy,
{
    let next_midnight = local
        .date_naive()
        .checked_add_days(Days::new(1))
        .and_then(|date| date.and_hms_opt(0, 0, 0))
        .and_then(|time| local.timezone().from_local_datetime(&time).earliest());
    let seconds = next_midnight
        .map(|midnight| (midnight - local).num_seconds())
        .unwrap_or(24 * 60 * 60)
        .max(60);
    u32::try_from((seconds + 59) / 60).unwrap_or(24 * 60)
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
                            let normalized_x = x * 1_000.0 / f64::from(size.width.max(1));
                            let normalized_y = y * 1_000.0 / f64::from(size.height.max(1));
                            let inside = state
                                .pet_hit_polygon
                                .lock()
                                .map(|polygon| {
                                    point_in_polygon(normalized_x, normalized_y, &polygon)
                                })
                                .unwrap_or(false);
                            Ok(inside)
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
                event_id,
                relocate_to: Some(rect),
                ..
            } => {
                animate_pet_relocation(app.clone(), event_id.clone(), *rect);
                position_bubble_window(app, *rect);
                if let Some(window) = app.get_webview_window(EFFECT_WINDOW) {
                    let _ = window.hide();
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
    let state = app.state::<DesktopState>();
    if let (Ok(runtime), Ok(mut polygon)) = (state.lock(), state.pet_hit_polygon.lock()) {
        *polygon = runtime
            .actions
            .iter()
            .find(|action| action.id == plan.action_id)
            .and_then(|action| action.hit_regions.first())
            .map(|region| region.polygon.clone())
            .unwrap_or_default();
    }
    schedule_episode_completion(
        app.clone(),
        plan.event_id.clone(),
        EPISODE_WATCHDOG_MS,
        false,
    );
    if let Some(window) = app.get_webview_window(PET_WINDOW) {
        let _ = window.set_size(PhysicalSize::new(
            plan.anchor_rect.width,
            plan.anchor_rect.height,
        ));
        let start = plan
            .motion_path
            .first()
            .copied()
            .unwrap_or(plan.anchor_rect);
        let _ = window.set_position(PhysicalPosition::new(start.x, start.y));
        let _ = window.emit(EVENT_PLAN, plan);
    }

    if let Some(window) = app.get_webview_window(BUBBLE_WINDOW) {
        position_bubble_window(app, plan.anchor_rect);
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
    } else {
        let watchdog_app = app.clone();
        let event_id = plan.event_id.clone();
        let _ = thread::Builder::new()
            .name("buddypet-capture-watchdog".into())
            .spawn(move || {
                thread::sleep(Duration::from_millis(CAPTURE_REVEAL_WATCHDOG_MS));
                let state = watchdog_app.state::<DesktopState>();
                let still_active = state
                    .inner
                    .lock()
                    .map(|runtime| {
                        runtime
                            .director
                            .active_plan()
                            .is_some_and(|active| active.event_id == event_id)
                    })
                    .unwrap_or(false);
                if still_active {
                    // A dead or wedged effect renderer must not suppress the pet
                    // and bubble for the rest of the episode. Showing the empty
                    // effect window is harmless and preserves the rest of the episode.
                    reveal_episode(&watchdog_app);
                }
            });
    }
}

fn position_bubble_window(app: &AppHandle, anchor: LogicalRect) {
    let Some(window) = app.get_webview_window(BUBBLE_WINDOW) else {
        return;
    };
    let position = monitor_layout_for_anchor(app, anchor)
        .map(|(work, scale_factor_percent)| bubble_position(anchor, work, scale_factor_percent))
        .unwrap_or_else(|| LogicalPoint {
            x: anchor.x,
            y: anchor
                .y
                .saturating_sub(i32::try_from(BUBBLE_HEIGHT).unwrap_or(124) + BUBBLE_GAP),
        });
    let _ = window.set_position(PhysicalPosition::new(position.x, position.y));
}

fn animate_pet_relocation(app: AppHandle, event_id: String, target: LogicalRect) {
    let Some(window) = app.get_webview_window(PET_WINDOW) else {
        return;
    };
    let reduce_motion = app
        .state::<DesktopState>()
        .lock()
        .ok()
        .and_then(|runtime| {
            runtime
                .director
                .active_plan()
                .map(|plan| plan.reduce_motion)
        })
        .unwrap_or(false);
    let Ok(from) = window.outer_position() else {
        let _ = window.set_position(PhysicalPosition::new(target.x, target.y));
        return;
    };
    if reduce_motion {
        let _ = window.set_position(PhysicalPosition::new(target.x, target.y));
        return;
    }

    let _ = thread::Builder::new()
        .name("buddypet-click-relocation".into())
        .spawn(move || {
            const FRAMES: u32 = 14;
            for frame in 1..=FRAMES {
                let still_current = app
                    .state::<DesktopState>()
                    .lock()
                    .map(|runtime| {
                        runtime
                            .director
                            .active_plan()
                            .is_some_and(|plan| plan.event_id == event_id)
                    })
                    .unwrap_or(false);
                if !still_current {
                    return;
                }
                let linear = f64::from(frame) / f64::from(FRAMES);
                let eased = 1.0 - (1.0 - linear).powi(3);
                let hop = (std::f64::consts::PI * linear).sin() * 34.0;
                let x = f64::from(from.x) + (f64::from(target.x) - f64::from(from.x)) * eased;
                let y = f64::from(from.y) + (f64::from(target.y) - f64::from(from.y)) * eased - hop;
                if let Some(window) = app.get_webview_window(PET_WINDOW) {
                    let _ = window.set_position(PhysicalPosition::new(
                        clamp_f64_to_i32(x),
                        clamp_f64_to_i32(y),
                    ));
                }
                thread::sleep(Duration::from_millis(20));
            }
        });
}

fn monitor_layout_for_anchor(app: &AppHandle, anchor: LogicalRect) -> Option<(LogicalRect, u16)> {
    let point = LogicalPoint {
        x: anchor.x,
        y: anchor.y,
    };
    app.available_monitors()
        .ok()?
        .into_iter()
        .map(|monitor| {
            let work = LogicalRect {
                x: monitor.position().x,
                y: monitor.position().y,
                width: monitor.size().width,
                height: monitor.size().height,
            };
            let scale_factor_percent = (monitor.scale_factor() * 100.0)
                .round()
                .clamp(1.0, f64::from(u16::MAX)) as u16;
            (work, scale_factor_percent)
        })
        .find(|(work, _)| work.contains(point))
}

fn clamp_overlay_position(
    preferred: LogicalPoint,
    width: u32,
    height: u32,
    work: LogicalRect,
) -> LogicalPoint {
    let left = i64::from(work.x);
    let top = i64::from(work.y);
    let right = left + i64::from(work.width);
    let bottom = top + i64::from(work.height);
    let max_x = (right - i64::from(width)).max(left);
    let max_y = (bottom - i64::from(height)).max(top);
    LogicalPoint {
        x: i32::try_from(i64::from(preferred.x).clamp(left, max_x)).unwrap_or(work.x),
        y: i32::try_from(i64::from(preferred.y).clamp(top, max_y)).unwrap_or(work.y),
    }
}

/// Centers the speech bubble above the native pet window. Keeping the two
/// windows vertically disjoint prevents horns, ears, and tall poses from
/// covering translated copy. The generic clamp still supports negative monitor
/// coordinates and very small work areas.
fn scaled_physical_dimension(logical: u32, scale_factor_percent: u16) -> u32 {
    let rounded = (u64::from(logical) * u64::from(scale_factor_percent) + 50) / 100;
    u32::try_from(rounded).unwrap_or(u32::MAX)
}

fn bubble_position(
    anchor: LogicalRect,
    work: LogicalRect,
    scale_factor_percent: u16,
) -> LogicalPoint {
    let bubble_width = scaled_physical_dimension(BUBBLE_WIDTH, scale_factor_percent);
    let bubble_height = scaled_physical_dimension(BUBBLE_HEIGHT, scale_factor_percent);
    let bubble_gap = scaled_physical_dimension(BUBBLE_GAP.unsigned_abs(), scale_factor_percent);
    let half_anchor = i64::from(anchor.width) / 2;
    let half_bubble = i64::from(bubble_width) / 2;
    let centered_x = i64::from(anchor.x) + half_anchor - half_bubble;
    let above_y = i64::from(anchor.y) - i64::from(bubble_height) - i64::from(bubble_gap);
    let below_y = i64::from(anchor.y) + i64::from(anchor.height) + i64::from(bubble_gap);
    let work_top = i64::from(work.y);
    let work_bottom = work_top + i64::from(work.height);
    let preferred_y = if above_y >= work_top {
        above_y
    } else if below_y + i64::from(bubble_height) <= work_bottom {
        below_y
    } else {
        above_y
    };
    let preferred = LogicalPoint {
        x: i32::try_from(centered_x.clamp(i64::from(i32::MIN), i64::from(i32::MAX)))
            .unwrap_or(anchor.x),
        y: i32::try_from(preferred_y.clamp(i64::from(i32::MIN), i64::from(i32::MAX)))
            .unwrap_or(anchor.y),
    };
    clamp_overlay_position(preferred, bubble_width, bubble_height, work)
}

fn schedule_episode_completion(
    app: AppHandle,
    event_id: String,
    delay_ms: u64,
    reaction_only: bool,
) {
    let _ = thread::Builder::new()
        .name("buddypet-episode-watchdog".into())
        .spawn(move || {
            thread::sleep(Duration::from_millis(delay_ms));
            let state = app.state::<DesktopState>();
            let Ok(mut runtime) = state.lock() else {
                return;
            };
            let current_matches = runtime
                .director
                .active_plan()
                .is_some_and(|active| active.event_id == event_id);
            if !current_matches
                || (reaction_only
                    && runtime.director.phase() != crate::core::DirectorPhase::Reaction)
            {
                return;
            }
            let commands = runtime.director.handle_renderer_event(
                RendererEvent::Completed {
                    event_id: event_id.clone(),
                },
                Utc::now(),
            );
            let _ = state.persist(&runtime);
            let snapshot = state.snapshot(&runtime);
            drop(runtime);
            dispatch_commands(&app, commands);
            let _ = app.emit(EVENT_SNAPSHOT, snapshot);
        });
}

fn reveal_episode(app: &AppHandle) {
    let plan = app
        .state::<DesktopState>()
        .lock()
        .ok()
        .and_then(|runtime| runtime.director.active_plan().cloned());
    let pet_was_visible = app
        .get_webview_window(PET_WINDOW)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    for label in [EFFECT_WINDOW, BUBBLE_WINDOW, PET_WINDOW] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.show();
        }
    }
    if !pet_was_visible && let Some(plan) = plan {
        animate_pet_motion(app.clone(), plan);
    }
}

fn animate_pet_motion(app: AppHandle, plan: EpisodePlan) {
    if plan.reduce_motion || plan.motion_path.len() < 2 {
        if let Some(window) = app.get_webview_window(PET_WINDOW) {
            let _ = window.set_position(PhysicalPosition::new(
                plan.anchor_rect.x,
                plan.anchor_rect.y,
            ));
        }
        return;
    }
    let _ = thread::Builder::new()
        .name("buddypet-pet-motion".into())
        .spawn(move || {
            let frame_ms = if plan.power_saver { 33_u64 } else { 16_u64 };
            let travel_ms = u64::from(plan.intro_duration_ms).saturating_mul(62) / 100;
            let segment_count =
                u64::try_from(plan.motion_path.len().saturating_sub(1)).unwrap_or(1);
            let frames_per_segment = (travel_ms / frame_ms / segment_count).max(1);

            for segment in plan.motion_path.windows(2) {
                let [from, to] = segment else {
                    continue;
                };
                for frame in 1..=frames_per_segment {
                    let still_current = app
                        .state::<DesktopState>()
                        .lock()
                        .map(|runtime| {
                            runtime.director.active_plan().is_some_and(|active| {
                                active.event_id == plan.event_id
                                    && active.anchor_rect == plan.anchor_rect
                            })
                        })
                        .unwrap_or(false);
                    if !still_current {
                        return;
                    }
                    let linear = frame as f64 / frames_per_segment as f64;
                    let eased = linear * linear * (3.0 - 2.0 * linear);
                    let x = f64::from(from.x) + (f64::from(to.x) - f64::from(from.x)) * eased;
                    let y = f64::from(from.y) + (f64::from(to.y) - f64::from(from.y)) * eased;
                    if let Some(window) = app.get_webview_window(PET_WINDOW) {
                        let _ = window.set_position(PhysicalPosition::new(
                            clamp_f64_to_i32(x),
                            clamp_f64_to_i32(y),
                        ));
                    }
                    thread::sleep(Duration::from_millis(frame_ms));
                }
            }
            if let Some(window) = app.get_webview_window(PET_WINDOW) {
                let _ = window.set_position(PhysicalPosition::new(
                    plan.anchor_rect.x,
                    plan.anchor_rect.y,
                ));
            }
        });
}

fn hide_episode(app: &AppHandle) {
    let state = app.state::<DesktopState>();
    state.pet_menu_open.store(false, Ordering::Relaxed);
    if let Ok(mut polygon) = state.pet_hit_polygon.lock() {
        polygon.clear();
    }
    for label in [PET_WINDOW, EFFECT_WINDOW, BUBBLE_WINDOW] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.emit(EVENT_HIDE, ());
            let _ = window.hide();
            let _ = window.set_ignore_cursor_events(true);
        }
    }
}

fn point_in_polygon(x: f64, y: f64, polygon: &[LogicalPoint]) -> bool {
    if polygon.len() < 3 || !x.is_finite() || !y.is_finite() {
        return false;
    }
    let mut inside = false;
    for (left, right) in polygon
        .iter()
        .zip(polygon.iter().cycle().skip(1))
        .take(polygon.len())
    {
        let (x1, y1) = (f64::from(left.x), f64::from(left.y));
        let (x2, y2) = (f64::from(right.x), f64::from(right.y));
        let cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
        let on_edge = cross.abs() <= 0.001
            && x >= x1.min(x2)
            && x <= x1.max(x2)
            && y >= y1.min(y2)
            && y <= y1.max(y2);
        if on_edge {
            return true;
        }
        let crosses = (y1 > y) != (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1;
        if crosses {
            inside = !inside;
        }
    }
    inside
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
    let next_locale = settings.locale;
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
    drop(runtime);
    // Rebuild even if the persisted value already matches. This repairs a tray
    // that was created before settings hydration or survived an older build.
    update_tray_locale(&app, next_locale);
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
            let minutes = request
                .duration_minutes
                .unwrap_or(30)
                .clamp(1, MAX_USER_PAUSE_MINUTES);
            runtime
                .director
                .snooze_until(Some(now + chrono::TimeDelta::minutes(i64::from(minutes))));
            commands
        }
        DesktopAction::Meeting => {
            let commands = finish_current_episode(&mut runtime, now);
            let minutes = request
                .duration_minutes
                .unwrap_or(60)
                .clamp(1, MAX_USER_PAUSE_MINUTES);
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

/// Debug-only automation hook used to exercise the real multi-window entrance
/// without granting the test runner Accessibility/Input Monitoring permission.
/// Release builds contain neither the call site nor this function.
#[cfg(debug_assertions)]
pub(crate) fn debug_test_entrance(app: &AppHandle) {
    let (now, local_date, local_minute, mut activity, monitors) = director_inputs(app);
    activity.last_input_age_ms = 0;
    activity.session_state = SessionState::Active;
    activity.fullscreen_state = FullscreenState::None;
    activity.mouse_buttons_down = false;
    if activity.pointer.is_none() {
        activity.pointer = monitors.first().map(|monitor| LogicalPoint {
            x: monitor.work_area.x + i32::try_from(monitor.work_area.width / 2).unwrap_or(0),
            y: monitor.work_area.y + i32::try_from(monitor.work_area.height / 2).unwrap_or(0),
        });
    }

    let state = app.state::<DesktopState>();
    let Ok(mut runtime) = state.lock() else {
        return;
    };
    let request = ActionRequest {
        action: DesktopAction::PreviewAction,
        duration_minutes: None,
        pet_id: None,
        action_id: None,
    };
    let Ok(commands) = start_requested_episode(
        &mut runtime,
        &request,
        true,
        now,
        local_date,
        local_minute,
        &activity,
        &monitors,
    ) else {
        return;
    };
    let _ = state.persist(&runtime);
    let snapshot = state.snapshot(&runtime);
    drop(runtime);
    dispatch_commands(app, commands);
    let _ = app.emit(EVENT_SNAPSHOT, snapshot);
}

#[cfg(debug_assertions)]
pub(crate) fn debug_test_click(app: &AppHandle) {
    let state = app.state::<DesktopState>();
    let Ok(mut runtime) = state.lock() else {
        return;
    };
    let Some(event_id) = runtime
        .director
        .active_plan()
        .map(|plan| plan.event_id.clone())
    else {
        return;
    };
    let commands = runtime.director.handle_renderer_event(
        RendererEvent::Clicked {
            event_id: event_id.clone(),
        },
        Utc::now(),
    );
    let _ = state.persist(&runtime);
    let snapshot = state.snapshot(&runtime);
    drop(runtime);
    dispatch_commands(app, commands);
    schedule_episode_completion(app.clone(), event_id, REACTION_WATCHDOG_MS, true);
    let _ = app.emit(EVENT_SNAPSHOT, snapshot);
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
    let incoming_event_id = event.event_id().to_owned();
    if let RendererEvent::PoseChanged { pose, .. } = &event
        && let Some(plan) = runtime.director.active_plan()
        && let Some(region) = runtime
            .actions
            .iter()
            .find(|action| action.id == plan.action_id)
            .and_then(|action| {
                action
                    .hit_regions
                    .iter()
                    .find(|region| region.pose == *pose)
            })
        && let Ok(mut polygon) = state.pet_hit_polygon.lock()
    {
        polygon.clone_from(&region.polygon);
    }
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
    let start_reaction_watchdog = commands.iter().any(|command| {
        matches!(
            command,
            DirectorCommand::React {
                reaction: crate::core::ReactionKind::StartledAndRelocate,
                ..
            }
        )
    });
    let snapshot = (!commands.is_empty()).then(|| state.snapshot(&runtime));
    if !commands.is_empty() {
        state.persist(&runtime)?;
    }
    drop(runtime);
    if reveal {
        reveal_episode(&app);
    }
    dispatch_commands(&app, commands);
    if start_reaction_watchdog {
        schedule_episode_completion(app.clone(), incoming_event_id, REACTION_WATCHDOG_MS, true);
    }
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

#[cfg(test)]
mod tests {
    use chrono::{FixedOffset, TimeZone};

    use crate::core::{Locale, LogicalPoint, LogicalRect};

    use super::{
        BUBBLE_GAP, BUBBLE_HEIGHT, BUBBLE_WIDTH, bubble_position, clamp_overlay_position,
        minutes_until_next_local_day, point_in_polygon, tray_copy,
    };

    #[test]
    fn rest_of_today_targets_the_next_local_midnight() {
        let zone = FixedOffset::east_opt(7 * 60 * 60).unwrap();
        let late_evening = zone.with_ymd_and_hms(2026, 8, 1, 22, 30, 0).unwrap();
        let midnight = zone.with_ymd_and_hms(2026, 8, 1, 0, 0, 0).unwrap();
        assert_eq!(minutes_until_next_local_day(late_evening), 90);
        assert_eq!(minutes_until_next_local_day(midnight), 1_440);
    }

    #[test]
    fn bubble_position_stays_inside_negative_coordinate_monitor() {
        let work = LogicalRect {
            x: -1_920,
            y: -200,
            width: 1_920,
            height: 1_080,
        };
        assert_eq!(
            clamp_overlay_position(LogicalPoint { x: -2_200, y: -500 }, 360, 150, work,),
            LogicalPoint { x: -1_920, y: -200 }
        );
        assert_eq!(
            clamp_overlay_position(LogicalPoint { x: -20, y: 900 }, 360, 150, work),
            LogicalPoint { x: -360, y: 730 }
        );
    }

    #[test]
    fn bubble_is_centered_above_pet_without_overlapping_it() {
        let work = LogicalRect {
            x: 0,
            y: 0,
            width: 1_920,
            height: 1_080,
        };
        let pet = LogicalRect {
            x: 820,
            y: 700,
            width: 300,
            height: 275,
        };
        let bubble = bubble_position(pet, work, 100);
        assert_eq!(bubble.x, 790);
        assert_eq!(
            bubble.y + i32::try_from(BUBBLE_HEIGHT).unwrap(),
            pet.y - BUBBLE_GAP
        );
        assert!(bubble.x >= work.x);
        assert!(bubble.x + i32::try_from(BUBBLE_WIDTH).unwrap() <= 1_920);
    }

    #[test]
    fn retina_bubble_uses_physical_size_when_placing_logical_window() {
        let work = LogicalRect {
            x: 0,
            y: 0,
            width: 3_024,
            height: 1_964,
        };
        let pet = LogicalRect {
            x: 1_194,
            y: 974,
            width: 280,
            height: 220,
        };
        let bubble = bubble_position(pet, work, 200);
        assert_eq!(bubble.x, 974);
        assert_eq!(
            bubble.y + i32::try_from(BUBBLE_HEIGHT * 2).unwrap(),
            pet.y - BUBBLE_GAP * 2
        );
    }

    #[test]
    fn bubble_moves_below_a_pet_near_the_top_edge() {
        let work = LogicalRect {
            x: 0,
            y: 0,
            width: 1_920,
            height: 1_080,
        };
        let pet = LogicalRect {
            x: 700,
            y: 24,
            width: 300,
            height: 220,
        };
        let bubble = bubble_position(pet, work, 100);
        assert_eq!(bubble.y, 258);
        assert!(bubble.y >= pet.y + i32::try_from(pet.height).unwrap() + BUBBLE_GAP);
    }

    #[test]
    fn native_hit_test_includes_polygon_edges_and_excludes_transparent_pixels() {
        let polygon = [
            LogicalPoint { x: 100, y: 100 },
            LogicalPoint { x: 900, y: 100 },
            LogicalPoint { x: 900, y: 900 },
            LogicalPoint { x: 100, y: 900 },
        ];
        assert!(point_in_polygon(500.0, 500.0, &polygon));
        assert!(point_in_polygon(100.0, 500.0, &polygon));
        assert!(!point_in_polygon(50.0, 500.0, &polygon));
        assert!(!point_in_polygon(f64::NAN, 500.0, &polygon));
    }

    #[test]
    fn tray_copy_covers_every_initial_locale() {
        let vi = tray_copy(Locale::Vi);
        assert_eq!(
            (vi.summon, vi.hide, vi.settings, vi.quit),
            ("Gọi Buddy", "Ẩn ngay", "Cài đặt…", "Thoát BuddyPet")
        );
        let en = tray_copy(Locale::En);
        assert_eq!(
            (en.summon, en.hide, en.settings, en.quit),
            ("Summon Buddy", "Hide now", "Settings…", "Quit BuddyPet")
        );
        let ko = tray_copy(Locale::Ko);
        assert_eq!(
            (ko.summon, ko.hide, ko.settings, ko.quit),
            ("Buddy 부르기", "지금 숨기기", "설정…", "BuddyPet 종료")
        );
        let ja = tray_copy(Locale::Ja);
        assert_eq!(
            (ja.summon, ja.hide, ja.settings, ja.quit),
            ("Buddyを呼ぶ", "今すぐ隠す", "設定…", "BuddyPetを終了")
        );
    }
}
