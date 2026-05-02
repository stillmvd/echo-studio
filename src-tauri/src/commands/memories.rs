use tauri::State;

use crate::echovault::{EchoVaultError, MemoriesFilter, MemoriesPage, MemoryWithBody};
use crate::state::AppState;

#[tauri::command]
pub async fn list_memories(
    state: State<'_, AppState>,
    filter: Option<MemoriesFilter>,
) -> Result<MemoriesPage, EchoVaultError> {
    let repo = state.repo()?;
    let f = filter.unwrap_or_default();
    repo.list(&f)
}

#[tauri::command]
pub async fn get_memory(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<MemoryWithBody>, EchoVaultError> {
    let repo = state.repo()?;
    repo.get(&id)
}
