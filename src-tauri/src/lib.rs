pub mod capture;
pub mod core;
pub mod platform;
mod shell;
pub mod voice_pack;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            #[cfg(debug_assertions)]
            if args.iter().any(|argument| argument == "--test-entrance") {
                shell::debug_test_entrance(app);
            }
            #[cfg(debug_assertions)]
            if args.iter().any(|argument| argument == "--test-click") {
                shell::debug_test_click(app);
            }
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(voice_pack::VoicePackManager::default())
        .invoke_handler(tauri::generate_handler![
            shell::get_app_snapshot,
            shell::update_settings,
            shell::complete_onboarding,
            shell::perform_app_action,
            shell::get_window_context,
            shell::renderer_event,
            shell::emergency_hide_now,
            shell::set_pet_menu_open,
            capture::list_capture_monitors,
            capture::capture_region,
            voice_pack::get_voice_pack_status,
            voice_pack::install_voice_pack,
            voice_pack::speak_dialogue,
            voice_pack::stop_dialogue,
        ])
        .setup(shell::setup)
        .on_window_event(shell::handle_settings_close)
        .run(tauri::generate_context!())
        .expect("error while running BuddyPet");
}
