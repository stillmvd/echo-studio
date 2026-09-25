use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::conversations::{
    paths::projects_root,
    reader::{read_session, search_in_sessions},
    scanner::{list_projects, list_sessions},
    titles::set_title,
    ConversationProject, DisplayItem, SessionMeta, SessionSearchHit,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFailure {
    pub path: String,
    pub error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkDeleteResult {
    pub deleted: Vec<String>,
    pub failed: Vec<DeleteFailure>,
}

fn ensure_path_within_projects(path: &Path) -> Result<(), String> {
    let root = projects_root().ok_or("cannot resolve projects root")?;
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("canonicalize root: {e}"))?;
    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("canonicalize path: {e}"))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err(format!(
            "refusing: {} is outside ~/.claude/projects",
            canonical_path.display()
        ));
    }
    if canonical_path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
        return Err(format!(
            "refusing: {} is not a .jsonl file",
            canonical_path.display()
        ));
    }
    Ok(())
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("task failed: {e}"))
}

#[tauri::command]
pub async fn list_conversation_projects() -> Result<Vec<ConversationProject>, String> {
    blocking(list_projects).await
}

#[tauri::command]
pub async fn list_conversation_sessions(project_id: String) -> Result<Vec<SessionMeta>, String> {
    blocking(move || list_sessions(&project_id)).await
}

#[tauri::command]
pub async fn read_session_events(file_path: String) -> Result<Vec<DisplayItem>, String> {
    let path = PathBuf::from(&file_path);
    ensure_path_within_projects(&path)?;
    blocking(move || read_session(&path)).await?
}

#[tauri::command]
pub async fn search_session_text(
    project_id: String,
    query: String,
) -> Result<Vec<SessionSearchHit>, String> {
    blocking(move || search_in_sessions(&project_id, &query)).await
}

#[tauri::command]
pub async fn set_session_user_title(
    session_id: String,
    title: Option<String>,
) -> Result<(), String> {
    set_title(&session_id, title)
}

#[tauri::command]
pub async fn delete_conversation_session(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    ensure_path_within_projects(&path)?;
    fs::remove_file(&path).map_err(|e| format!("remove_file: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn bulk_delete_conversation_sessions(
    file_paths: Vec<String>,
) -> Result<BulkDeleteResult, String> {
    let mut deleted = Vec::new();
    let mut failed = Vec::new();
    for fp in file_paths {
        let path = PathBuf::from(&fp);
        match ensure_path_within_projects(&path)
            .and_then(|()| fs::remove_file(&path).map_err(|e| format!("remove_file: {e}")))
        {
            Ok(()) => deleted.push(fp),
            Err(e) => failed.push(DeleteFailure { path: fp, error: e }),
        }
    }
    Ok(BulkDeleteResult { deleted, failed })
}
