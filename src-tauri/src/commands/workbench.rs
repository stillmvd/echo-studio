use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, State};

use crate::commands::conversations::blocking;
use crate::workbench::sessions::{self, ClaudeSession, Started};
use crate::workbench::terminal::Terminals;
use crate::workbench::watch::SessionsHub;
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
    // TODO(005 US3): dev jobs from dev.rs
    blocking(move || {
        processes::list_processes(&projects::scan(&root), live_agents(), Vec::new(), &root)
    })
    .await
}

fn live_agents() -> Vec<processes::AgentRef> {
    sessions::run_agents()
        .unwrap_or_default()
        .into_iter()
        .filter(sessions::is_live)
        .map(|a| processes::AgentRef {
            pid: a.pid,
            session_id: a.session_id,
            cwd: a.cwd,
        })
        .collect()
}

#[tauri::command]
pub async fn kill_processes(
    targets: Vec<processes::KillTarget>,
    confirmed: bool,
) -> Result<processes::KillResult, String> {
    let root = projects_root().ok_or("cannot resolve Projects root")?;
    blocking(move || {
        processes::kill_processes(
            &targets,
            confirmed,
            &projects::scan(&root),
            live_agents(),
            Vec::new(),
            &root,
        )
    })
    .await
}

#[tauri::command]
pub async fn list_claude_sessions() -> Result<Vec<ClaudeSession>, String> {
    blocking(sessions::list).await?
}

#[tauri::command]
pub fn set_workbench_active(hub: State<'_, SessionsHub>, active: bool) {
    hub.active.store(active, Ordering::Relaxed);
    if active {
        hub.poke();
    }
}

#[tauri::command]
pub async fn start_claude_session(
    hub: State<'_, SessionsHub>,
    project_path: String,
    resume_session_id: Option<String>,
) -> Result<Started, String> {
    let started = blocking(move || {
        let project = projects::ensure_project(&project_path)?;
        sessions::start(&PathBuf::from(project.path), resume_session_id.as_deref())
    })
    .await?;
    hub.poke();
    started
}

#[tauri::command]
pub async fn stop_claude_session(
    hub: State<'_, SessionsHub>,
    short_id: String,
) -> Result<(), String> {
    let result = blocking(move || sessions::stop(&short_id)).await?;
    hub.poke();
    result
}

#[tauri::command]
pub async fn forget_claude_session(
    hub: State<'_, SessionsHub>,
    short_id: String,
) -> Result<(), String> {
    let result = blocking(move || sessions::forget(&short_id)).await?;
    hub.poke();
    result
}

#[tauri::command]
pub fn terminal_attach(
    app: AppHandle,
    terms: State<'_, Terminals>,
    short_id: String,
    cols: u16,
    rows: u16,
    on_data: Channel<Response>,
) -> Result<String, String> {
    terms.attach(app, &short_id, cols, rows, on_data)
}

#[tauri::command]
pub fn terminal_write(
    terms: State<'_, Terminals>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    terms.write(&terminal_id, &data)
}

#[tauri::command]
pub fn terminal_resize(
    terms: State<'_, Terminals>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    terms.resize(&terminal_id, cols, rows)
}

#[tauri::command]
pub fn terminal_detach(terms: State<'_, Terminals>, terminal_id: String) -> Result<(), String> {
    terms.detach(&terminal_id)
}

#[tauri::command]
pub fn terminal_detach_all(terms: State<'_, Terminals>) {
    terms.detach_all();
}
