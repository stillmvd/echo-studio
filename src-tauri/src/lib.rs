mod commands;
mod conversations;
mod memory;
mod splash;
mod tooling;
mod visibility;
mod workbench;

use tauri::Manager;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

#[cfg(not(debug_assertions))]
const EVENT_ACTIVATED: &str = "echo://activated";

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

#[tauri::command]
fn toasts_muted() -> bool {
    splash::background()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    workbench::dev::set_app_id(&context.config().identifier);
    let splash = splash::show(&context.config().identifier);
    let builder = tauri::Builder::default();
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        if let Some(window) = app.get_webview_window("main") {
            if window.is_visible().unwrap_or(false) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
        let _ = tauri::Emitter::emit(app, EVENT_ACTIVATED, ());
    }));
    builder
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_flags())
                .build(),
        )
        .manage(splash)
        .manage(workbench::terminal::Terminals::default())
        .manage(visibility::Shown::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let _ = window.app_handle().save_window_state(window_flags());
                window
                    .app_handle()
                    .state::<workbench::terminal::Terminals>()
                    .detach_all();
            }
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_ship::init(|app| {
            let _ = app.save_window_state(window_flags());
        }))
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(s) = app.state::<Option<splash::Splash>>().inner() {
                    s.attach(window.clone());
                }
                visibility::start(window.clone());
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(10));
                    if !window.is_visible().unwrap_or(true) {
                        splash::show_main(&window);
                    }
                });
            }
            if let Some(root) = workbench::projects_root() {
                workbench::watch::start_projects(app.handle().clone(), root);
            }
            workbench::limits::start_limits(app.handle().clone());
            app.manage(workbench::watch::start_sessions(app.handle().clone()));
            workbench::dev::start_monitor(app.handle().clone());
            if let Some(home) = dirs::home_dir() {
                memory::watch::start(app.handle().clone(), memory::projects_root(&home));
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
            commands::conversations::rename_session,
            commands::tooling::set_tool_enabled,
            commands::tooling::list_config_backups,
            commands::tooling::list_tools,
            commands::tooling::read_tool_runs,
            commands::tooling::delete_tool,
            commands::tooling::update_tool,
            commands::tooling::check_tool_updates,
            commands::memory::list_memory_projects,
            commands::memory::list_memory,
            commands::memory::read_memory_file,
            commands::memory::search_memory,
            commands::memory::save_memory_file,
            commands::memory::archive_memory_record,
            commands::memory::restore_memory_record,
            commands::memory::move_memory_record,
            commands::memory::find_memory_duplicates,
            commands::memory::set_memory_duplicate_ignored,
            commands::memory::patch_memory_record,
            commands::memory::merge_memory_records,
            commands::workbench::list_workbench_projects,
            commands::workbench::read_rate_limits,
            commands::workbench::read_usage,
            commands::workbench::read_git_states,
            commands::workbench::read_load,
            commands::workbench::kill_processes,
            commands::workbench::list_claude_sessions,
            visibility::window_visible,
            commands::workbench::focus_session_window,
            commands::workbench::open_in_vscode,
            commands::workbench::set_workbench_active,
            commands::workbench::start_claude_session,
            commands::workbench::stop_claude_session,
            commands::workbench::restart_claude_session,
            commands::workbench::forget_claude_session,
            commands::workbench::terminal_attach,
            commands::workbench::terminal_write,
            commands::workbench::terminal_resize,
            commands::workbench::terminal_detach,
            commands::workbench::terminal_detach_all,
            commands::workbench::list_dev_servers,
            commands::workbench::start_dev_server,
            commands::workbench::stop_dev_server,
            commands::workbench::tail_dev_log,
            commands::workbench::untail_dev_log,
            commands::workbench::open_dev_server,
            commands::workbench::open_terminal_path,
            commands::workbench::resolve_terminal_paths,
            app_ready,
            toasts_muted,
        ])
        .run(context)
        .expect("error while running tauri application");
}
