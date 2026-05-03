use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::conversations::{
    paths::projects_root,
    reader::{read_session, search_in_sessions},
    scanner::{list_projects, list_sessions},
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
            "refusing to delete: {} is outside ~/.claude/projects",
            canonical_path.display()
        ));
    }
    if canonical_path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
        return Err(format!(
            "refusing to delete: {} is not a .jsonl file",
            canonical_path.display()
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_conversation_projects() -> Result<Vec<ConversationProject>, String> {
    Ok(list_projects())
}

#[tauri::command]
pub async fn list_conversation_sessions(project_id: String) -> Result<Vec<SessionMeta>, String> {
    Ok(list_sessions(&project_id))
}

#[tauri::command]
pub async fn read_session_events(file_path: String) -> Result<Vec<DisplayItem>, String> {
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
