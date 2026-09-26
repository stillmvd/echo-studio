mod commands;
mod conversations;
mod splash;
mod tooling;

use tauri::Manager;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

fn window_flags() -> StateFlags {
    StateFlags::all() & !StateFlags::DECORATIONS & !StateFlags::VISIBLE
}

#[tauri::command]
fn app_ready(window: tauri::WebviewWindow, splash: tauri::State<Option<splash::Splash>>) {
    match splash.inner() {
        Some(s) => s.ready(),
        None => splash::show_main(&window),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let splash = splash::show(&context.config().identifier);
    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_flags())
                .build(),
        )
        .manage(splash)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let _ = window.app_handle().save_window_state(window_flags());
            }
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(s) = app.state::<Option<splash::Splash>>().inner() {
                    s.attach(window.clone());
                }
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(10));
                    if !window.is_visible().unwrap_or(true) {
                        splash::show_main(&window);
                    }
                });
            }
            if let Some(home) = dirs::home_dir() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let cwds: Vec<String> = conversations::scanner::list_projects()
                        .into_iter()
                        .map(|p| p.cwd)
                        .collect();
                    let scopes = tooling::effective::list_scopes(&home, &cwds);
                    tooling::watch::start(handle, home, scopes);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::open_in_claude_code,
            commands::system::write_text_file,
            commands::system::reveal_in_explorer,
            commands::conversations::list_conversation_projects,
            commands::conversations::list_conversation_sessions,
            commands::conversations::read_session_events,
            commands::conversations::search_session_text,
            commands::conversations::delete_conversation_session,
            commands::conversations::bulk_delete_conversation_sessions,
            commands::conversations::set_session_user_title,
            commands::tooling::list_tool_scopes,
            commands::tooling::scan_tool_scope,
            commands::tooling::read_tool_file,
            commands::tooling::set_tool_enabled,
            commands::tooling::list_config_backups,
            app_ready,
        ])
        .run(context)
        .expect("error while running tauri application");
}
