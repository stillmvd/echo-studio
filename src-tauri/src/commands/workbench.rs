use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Emitter, State};

use crate::agent::{self, AgentKind};
use crate::commands::conversations::blocking;
use crate::workbench::kimi::{self, HOSTS};
use crate::workbench::sessions::{self, ClaudeSession, Started};
use crate::workbench::terminal::Terminals;
use crate::workbench::watch::SessionsHub;
use crate::workbench::{
    child_command, dev, git, limits, links, processes, projects, projects_root, usage, window,
};

#[tauri::command]
pub async fn list_workbench_projects() -> Result<projects::ProjectTree, String> {
    let root = projects_root().ok_or("Не найдена папка Projects")?;
    blocking(move || projects::scan(&root)).await
}

#[tauri::command]
pub async fn set_folder_kind(path: String, group: bool) -> Result<(), String> {
    let root = projects_root().ok_or("Не найдена папка Projects")?;
    blocking(move || {
        projects::set_kind(&root, &path, group)?;
        *TREE.lock().unwrap_or_else(|e| e.into_inner()) = None;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn read_rate_limits() -> Result<Option<limits::RateLimits>, String> {
    blocking(limits::read).await
}

#[tauri::command]
pub async fn read_usage(
    offset_minutes: i32,
    window_start: Option<i64>,
) -> Result<usage::Report, String> {
    let root = projects_root().ok_or("Не найдена папка Projects")?;
    blocking(move || usage::read_usage(&projects::scan(&root), offset_minutes, window_start)).await
}

#[tauri::command]
pub async fn read_git_states(
    paths: Vec<String>,
) -> Result<HashMap<String, Option<git::GitState>>, String> {
    blocking(move || git::git_states(&paths)).await
}

#[tauri::command]
pub async fn read_load() -> Result<processes::Load, String> {
    let root = projects_root().ok_or("Не найдена папка Projects")?;
    blocking(move || {
        Ok(processes::load(
            &cached_tree(&root),
            live_agents(LOAD_FRESH)?,
            dev::jobs(),
            &root,
        ))
    })
    .await?
}

const LOAD_FRESH: Duration = Duration::from_secs(30);

static TREE: LazyLock<Mutex<Option<(Instant, projects::ProjectTree)>>> =
    LazyLock::new(|| Mutex::new(None));

fn cached_tree(root: &Path) -> projects::ProjectTree {
    let mut slot = TREE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((at, tree)) = slot.as_ref() {
        if at.elapsed() < LOAD_FRESH {
            return tree.clone();
        }
    }
    let tree = projects::scan(root);
    *slot = Some((Instant::now(), tree.clone()));
    tree
}

fn live_agents(max_age: Duration) -> Result<Vec<processes::AgentRef>, String> {
    Ok(sessions::run_agents_cached(max_age)?
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
    let root = projects_root().ok_or("Не найдена папка Projects")?;
    blocking(move || {
        Ok(processes::kill_processes(
            &targets,
            confirmed,
            &projects::scan(&root),
            live_agents(Duration::ZERO)?,
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
pub async fn focus_session_window(pid: u32, session_id: String) -> Result<window::Focus, String> {
    blocking(move || {
        if sessions::session_pid(&session_id)? != pid {
            return Err("Этот pid не принадлежит claude сессии".to_owned());
        }
        Ok(window::focus(pid))
    })
    .await?
}

fn on_path(name: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(name))
            .find(|p| p.is_file())
    })
}

fn vscode_cli() -> Option<PathBuf> {
    on_path("code.cmd")
}

#[tauri::command]
pub async fn open_in_vscode(project_path: String) -> Result<(), String> {
    let project = blocking(move || projects::ensure_place(&project_path)).await??;
    let code = vscode_cli().ok_or("VS Code не найден в PATH")?;
    child_command(&code.to_string_lossy())
        .arg(&project.path)
        .spawn()
        .map_err(|e| format!("Не удалось запустить VS Code: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn resolve_terminal_paths(
    base: Option<String>,
    paths: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
    blocking(move || {
        let base = base.map(PathBuf::from);
        paths
            .iter()
            .map(|p| links::resolve(base.as_deref(), p).map(|p| p.to_string_lossy().into_owned()))
            .collect()
    })
    .await
}

fn zed_cli() -> Option<PathBuf> {
    on_path("zed.exe").or_else(|| {
        let local = PathBuf::from(std::env::var_os("LOCALAPPDATA")?);
        Some(local.join(r"Programs\Zed\bin\zed.exe")).filter(|p| p.is_file())
    })
}

#[tauri::command]
pub async fn open_terminal_path(
    path: String,
    line: Option<u32>,
    column: Option<u32>,
) -> Result<(), String> {
    let opener = blocking(move || {
        let target = Path::new(&path);
        (target.is_absolute() && target.exists())
            .then(|| links::opener(target, line, column))
            .ok_or_else(|| format!("не найдено: {path}"))
    })
    .await??;
    let spawned = match opener {
        links::Opener::Explorer(target) => child_command("explorer.exe").arg(target).spawn(),
        links::Opener::Editor(target) => match zed_cli() {
            Some(zed) => child_command(&zed.to_string_lossy()).arg(&target).spawn(),
            None => {
                let code = vscode_cli().ok_or("Zed и VS Code не найдены")?;
                child_command(&code.to_string_lossy())
                    .args(["-g", &target])
                    .spawn()
            }
        },
    };
    spawned.map_err(|e| format!("Не удалось открыть: {e}"))?;
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
    app: AppHandle,
    hub: State<'_, SessionsHub>,
    project_path: String,
    resume_session_id: Option<String>,
) -> Result<Started, String> {
    let started = blocking(move || {
        let project = projects::ensure_place(&project_path)?;
        let path = PathBuf::from(project.path);
        let resume = resume_session_id.as_deref();
        if agent::current_kind() == AgentKind::Kimi || resume.is_some_and(kimi::is_session_id) {
            HOSTS.start(app, &path, resume)
        } else {
            sessions::start(&path, resume)
        }
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
    let result = blocking(move || {
        if HOSTS.is_hosted(&short_id) {
            HOSTS.stop(&short_id)
        } else {
            sessions::stop(&short_id)
        }
    })
    .await?;
    hub.poke();
    result
}

#[tauri::command]
pub async fn restart_claude_session(
    app: AppHandle,
    hub: State<'_, SessionsHub>,
    project_path: String,
    session_id: String,
    short_id: String,
) -> Result<Started, String> {
    let started = blocking(move || {
        let project = projects::ensure_place(&project_path)?;
        let path = PathBuf::from(project.path);
        if HOSTS.is_hosted(&short_id) || kimi::is_session_id(&session_id) {
            HOSTS.restart(app, &path, &session_id, &short_id)
        } else {
            sessions::restart(&path, &session_id, &short_id)
        }
    })
    .await?;
    hub.poke();
    started
}

#[tauri::command]
pub async fn forget_claude_session(
    hub: State<'_, SessionsHub>,
    short_id: String,
) -> Result<(), String> {
    let result = blocking(move || {
        if HOSTS.is_hosted(&short_id) {
            HOSTS.forget(&short_id)
        } else {
            sessions::forget(&short_id)
        }
    })
    .await?;
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
    if HOSTS.is_hosted(&short_id) {
        kimi::ensure_hosted(&short_id)?;
        return HOSTS.attach(&short_id, cols, rows, on_data);
    }
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
    if kimi::is_terminal(&terminal_id) {
        return HOSTS.write(&terminal_id, &data);
    }
    terms.write(&terminal_id, &data)
}

#[tauri::command]
pub fn terminal_resize(
    terms: State<'_, Terminals>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if kimi::is_terminal(&terminal_id) {
        return HOSTS.resize(&terminal_id, cols, rows);
    }
    terms.resize(&terminal_id, cols, rows)
}

#[tauri::command]
pub fn terminal_detach(terms: State<'_, Terminals>, terminal_id: String) -> Result<(), String> {
    if kimi::is_terminal(&terminal_id) {
        HOSTS.detach(&terminal_id);
        return Ok(());
    }
    terms.detach(&terminal_id)
}

#[tauri::command]
pub fn terminal_detach_all(terms: State<'_, Terminals>) {
    terms.detach_all();
    HOSTS.detach_all();
}

#[tauri::command]
pub async fn quit_stopping_kimi(app: AppHandle, terms: State<'_, Terminals>) -> Result<(), String> {
    use tauri_plugin_window_state::AppHandleExt;
    let _ = app.save_window_state(crate::window_flags());
    terms.detach_all();
    HOSTS.detach_all();
    blocking(|| HOSTS.stop_all()).await?;
    app.exit(0);
    Ok(())
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
        dev::first_port(&project.path).ok_or_else(|| "У dev-сервера ещё нет порта".to_owned())
    })
    .await??;
    child_command("explorer.exe")
        .arg(format!("http://localhost:{port}"))
        .spawn()
        .map_err(|e| format!("Не удалось открыть браузер: {e}"))?;
    Ok(())
}
