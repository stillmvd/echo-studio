use crate::conversations::{
    scanner::{list_projects, list_sessions},
    ConversationProject, SessionMeta,
};

#[tauri::command]
pub async fn list_conversation_projects() -> Result<Vec<ConversationProject>, String> {
    Ok(list_projects())
}

#[tauri::command]
pub async fn list_conversation_sessions(project_id: String) -> Result<Vec<SessionMeta>, String> {
    Ok(list_sessions(&project_id))
}
