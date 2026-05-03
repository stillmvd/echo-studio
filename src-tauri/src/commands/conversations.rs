use std::path::PathBuf;

use crate::conversations::{
    reader::{read_session, search_in_sessions},
    scanner::{list_projects, list_sessions},
    ConversationProject, SessionEvent, SessionMeta, SessionSearchHit,
};

#[tauri::command]
pub async fn list_conversation_projects() -> Result<Vec<ConversationProject>, String> {
    Ok(list_projects())
}

#[tauri::command]
pub async fn list_conversation_sessions(project_id: String) -> Result<Vec<SessionMeta>, String> {
    Ok(list_sessions(&project_id))
}

#[tauri::command]
pub async fn read_session_events(file_path: String) -> Result<Vec<SessionEvent>, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("file not found: {file_path}"));
    }
    read_session(&path)
}

#[tauri::command]
pub async fn search_session_text(
    project_id: String,
    query: String,
) -> Result<Vec<SessionSearchHit>, String> {
    Ok(search_in_sessions(&project_id, &query))
}
