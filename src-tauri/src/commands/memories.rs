use tauri::State;

use crate::echovault::{
    backup::{create_backup, list_backups, rotate_backups},
    BackupInfo, BulkResult, EchoVaultError, MemoriesFilter, MemoriesPage, MemoryPatch,
    MemoryWithBody,
};
use crate::state::AppState;

#[tauri::command]
pub async fn list_memories(
    state: State<'_, AppState>,
    filter: Option<MemoriesFilter>,
) -> Result<MemoriesPage, EchoVaultError> {
    let repo = state.repo()?;
    let f = filter.unwrap_or_default();
    repo.search(&f).await
}

#[tauri::command]
pub async fn get_memory(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<MemoryWithBody>, EchoVaultError> {
    let repo = state.repo()?;
    repo.get(&id)
}

#[tauri::command]
pub async fn archive_memory(
    state: State<'_, AppState>,
    id: String,
    reason: Option<String>,
) -> Result<bool, EchoVaultError> {
    let repo = state.repo()?;
    repo.archive(&id, reason.as_deref().unwrap_or("archived"))
}

#[tauri::command]
pub async fn restore_memory(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, EchoVaultError> {
    let repo = state.repo()?;
    repo.restore(&id)
}

#[tauri::command]
pub async fn delete_memory(state: State<'_, AppState>, id: String) -> Result<bool, EchoVaultError> {
    let repo = state.repo()?;
    repo.hard_delete(&id)
}

#[tauri::command]
pub async fn bulk_archive_memories(
    state: State<'_, AppState>,
    ids: Vec<String>,
    reason: Option<String>,
) -> Result<BulkResult, EchoVaultError> {
    let repo = state.repo()?;
    repo.bulk_archive(&ids, reason.as_deref().unwrap_or("archived"))
}

#[tauri::command]
pub async fn bulk_restore_memories(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<BulkResult, EchoVaultError> {
    let repo = state.repo()?;
    repo.bulk_restore(&ids)
}

#[tauri::command]
pub async fn bulk_delete_memories(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<BulkResult, EchoVaultError> {
    let repo = state.repo()?;
    repo.bulk_delete(&ids)
}

#[tauri::command]
pub async fn list_db_backups(
    state: State<'_, AppState>,
) -> Result<Vec<BackupInfo>, EchoVaultError> {
    let repo = state.repo()?;
    list_backups(repo.home())
}

#[tauri::command]
pub async fn manual_backup(state: State<'_, AppState>) -> Result<String, EchoVaultError> {
    let repo = state.repo()?;
    let path = create_backup(repo.home())?;
    rotate_backups(repo.home(), 20)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn update_memory(
    state: State<'_, AppState>,
    id: String,
    patch: MemoryPatch,
) -> Result<bool, EchoVaultError> {
    let repo = state.repo()?;
    repo.update(&id, &patch)
}
