use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Emitter, State};

use crate::commands::conversations::blocking;
use crate::workbench::sessions::{self, ClaudeSession, Started};
use crate::workbench::terminal::Terminals;
use crate::workbench::watch::SessionsHub;
use crate::workbench::{
    child_command, dev, git, limits, processes, projects, projects_root, usage, window,
};

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
    blocking(move || {
        Ok(processes::list_processes(
            &projects::scan(&root),
            live_agents()?,
            dev::jobs(),
            &root,
        ))
    })
    .await?
}

fn live_agents() -> Result<Vec<processes::AgentRef>, String> {
    Ok(sessions::run_agents_cached(sessions::AGENTS_FRESH)?
        .into_iter()
        .filter(sessions::is_live)
        .map(|a| processes::AgentRef {
            pid: a.pid,
            session_id: a.session_id,
            cwd: a.cwd,
            short_id: a.id,
        })
        .collect())
}

#[tauri::command]
pub async fn kill_processes(
    targets: Vec<processes::KillTarget>,
    confirmed: bool,
) -> Result<processes::KillResult, String> {
    let root = projects_root().ok_or("cannot resolve Projects root")?;
    blocking(move || {
        Ok(processes::kill_processes(
            &targets,
            confirmed,
            &projects::scan(&root),
            live_agents()?,
            dev::jobs(),
            &root,
        ))
    })
    .await?
}

#[tauri::command]
pub async fn list_claude_sessions() -> Result<Vec<ClaudeSession>, String> {
    blocking(sessions::list).await?
}

#[tauri::command]
pub async fn empty_claude_sessions(session_ids: Vec<String>) -> Result<Vec<String>, String> {
    blocking(move || {
        crate::conversations::paths::projects_root()
            .map(|dir| sessions::empty_sessions(&dir, &session_ids))
            .unwrap_or_default()
    })
    .await
}

#[tauri::command]
pub async fn focus_session_window(pid: u32, session_id: String) -> Result<window::Focus, String> {
    blocking(move || {
        if sessions::session_pid(&session_id)? != pid {
            return Err("pid is not the session's claude".to_owned());
        }
        Ok(window::focus(pid))
    })
    .await?
}

fn vscode_cli() -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join("code.cmd"))
            .find(|p| p.is_file())
    })
}

#[tauri::command]
pub async fn open_in_vscode(project_path: String) -> Result<(), String> {
    let project = blocking(move || projects::ensure_project(&project_path)).await??;
    let code = vscode_cli().ok_or("VS Code не найден в PATH")?;
    child_command(&code.to_string_lossy())
        .arg(&project.path)
        .spawn()
        .map_err(|e| format!("failed to start VS Code: {e}"))?;
    Ok(())
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
pub async fn terminal_attach(
    app: AppHandle,
    terms: State<'_, Terminals>,
    short_id: String,
    cols: u16,
    rows: u16,
    on_data: Channel<Response>,
) -> Result<String, String> {
    let id = short_id.clone();
    blocking(move || sessions::ensure_attachable(&id)).await??;
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

#[tauri::command]
pub async fn list_dev_servers() -> Result<Vec<dev::DevServer>, String> {
    blocking(dev::list).await
}

#[tauri::command]
pub async fn start_dev_server(
    app: AppHandle,
    project_path: String,
) -> Result<dev::DevServer, String> {
    let notify = app.clone();
    let server = blocking(move || {
        dev::start(&project_path, move || {
            let _ = notify.emit(dev::EVENT_DEV, ());
        })
    })
    .await??;
    let _ = app.emit(dev::EVENT_DEV, ());
    Ok(server)
}

#[tauri::command]
pub async fn stop_dev_server(app: AppHandle, project_path: String) -> Result<(), String> {
    blocking(move || dev::stop(&project_path)).await??;
    let _ = app.emit(dev::EVENT_DEV, ());
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TailSubscription {
    subscription_id: u32,
}

#[tauri::command]
pub async fn tail_dev_log(
    project_path: String,
    on_data: Channel<Vec<u8>>,
) -> Result<TailSubscription, String> {
    let project = blocking(move || projects::ensure_project(&project_path)).await??;
    let subscription_id = dev::tail(&project.path, on_data)?;
    Ok(TailSubscription { subscription_id })
}

#[tauri::command]
pub async fn untail_dev_log(subscription_id: u32) -> Result<(), String> {
    dev::untail(subscription_id);
    Ok(())
}

#[tauri::command]
pub async fn open_dev_server(project_path: String) -> Result<(), String> {
    let port = blocking(move || {
        let project = projects::ensure_project(&project_path)?;
        dev::first_port(&project.path).ok_or_else(|| "dev server has no port yet".to_owned())
    })
    .await??;
    child_command("explorer.exe")
        .arg(format!("http://localhost:{port}"))
        .spawn()
        .map_err(|e| format!("failed to open the browser: {e}"))?;
    Ok(())
}
