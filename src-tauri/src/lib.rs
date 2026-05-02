mod commands;
pub mod echovault;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
