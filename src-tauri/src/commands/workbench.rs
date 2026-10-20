use crate::commands::conversations::blocking;
use crate::workbench::{projects, projects_root};

#[tauri::command]
pub async fn list_workbench_projects() -> Result<projects::ProjectTree, String> {
    let root = projects_root().ok_or("cannot resolve Projects root")?;
    blocking(move || projects::scan(&root)).await
}
