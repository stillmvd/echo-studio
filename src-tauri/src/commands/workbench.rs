use std::collections::HashMap;

use crate::commands::conversations::blocking;
use crate::workbench::{git, limits, processes, projects, projects_root, usage};

#[tauri::command]
pub async fn list_workbench_projects() -> Result<projects::ProjectTree, String> {
    let root = projects_root().ok_or("cannot resolve Projects root")?;
    blocking(move || projects::scan(&root)).await
}

#[tauri::command]
pub async fn read_rate_limits() -> Result<Option<limits::RateLimits>, String> {
    blocking(limits::read).await
}

#[tauri::command]
pub async fn read_usage() -> Result<HashMap<String, usage::Usage>, String> {
    let root = projects_root().ok_or("cannot resolve Projects root")?;
    blocking(move || usage::read_usage(&projects::scan(&root))).await
}

#[tauri::command]
pub async fn read_git_states(
    paths: Vec<String>,
) -> Result<HashMap<String, Option<git::GitState>>, String> {
    blocking(move || git::git_states(&paths)).await
}

#[tauri::command]
pub async fn list_processes() -> Result<Vec<processes::ProcessRow>, String> {
    let root = projects_root().ok_or("cannot resolve Projects root")?;
    // TODO: agents from sessions.rs and dev jobs from dev.rs once US1/US3 land
    blocking(move || {
        processes::list_processes(&projects::scan(&root), Vec::new(), Vec::new(), &root)
    })
    .await
}

#[tauri::command]
pub async fn kill_processes(
    pids: Vec<u32>,
    confirmed: bool,
) -> Result<processes::KillResult, String> {
    let root = projects_root().ok_or("cannot resolve Projects root")?;
    blocking(move || {
        processes::kill_processes(
            &pids,
            confirmed,
            &projects::scan(&root),
            Vec::new(),
            Vec::new(),
            &root,
        )
    })
    .await
}
