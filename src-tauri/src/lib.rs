mod commands;
mod conversations;
pub mod echovault;
mod services;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .setup(|app| {
            let state = app.state::<AppState>();
            if let Ok(repo) = state.repo() {
                let home = repo.home().clone();
                let db_path = echovault::paths::index_db_path(&home);
                if let Err(e) =
                    services::file_watcher::start_watching(app.handle().clone(), db_path)
                {
                    eprintln!("[echo-studio] watcher init failed: {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::memories::list_memories,
            commands::memories::get_memory,
            commands::memories::archive_memory,
            commands::memories::restore_memory,
            commands::memories::delete_memory,
            commands::memories::bulk_archive_memories,
            commands::memories::bulk_restore_memories,
            commands::memories::bulk_delete_memories,
            commands::memories::list_db_backups,
            commands::memories::manual_backup,
            commands::memories::update_memory,
            commands::system::open_in_claude_code,
            commands::system::trigger_reindex,
            commands::conversations::list_conversation_projects,
            commands::conversations::list_conversation_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
