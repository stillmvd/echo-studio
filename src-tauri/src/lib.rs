mod commands;
mod conversations;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::DECORATIONS,
                )
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
