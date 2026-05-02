use std::path::PathBuf;
use std::process::Stdio;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

pub const EVENT_REINDEX_PROGRESS: &str = "echovault://reindex-progress";
pub const EVENT_REINDEX_DONE: &str = "echovault://reindex-done";
pub const EVENT_REINDEX_ERROR: &str = "echovault://reindex-error";

#[tauri::command]
pub async fn open_in_claude_code(app: AppHandle, cwd: Option<String>) -> Result<String, String> {
    let target_dir = resolve_cwd(cwd);

    use tauri_plugin_shell::ShellExt;
    app.shell()
        .command("wt")
        .args(["-d", &target_dir, "claude"])
        .spawn()
        .map_err(|e| format!("failed to spawn `wt`: {e}"))?;

    Ok(target_dir)
}

#[tauri::command]
pub async fn trigger_reindex(app: AppHandle) -> Result<(), String> {
    let exe = locate_memory_exe()
        .ok_or_else(|| "memory.exe not found in PATH or Python Scripts/".to_string())?;

    let mut child = Command::new(&exe)
        .arg("reindex")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn `{}`: {e}", exe.display()))?;

    let stdout = child.stdout.take().ok_or("stdout missing")?;
    let stderr = child.stderr.take().ok_or("stderr missing")?;

    let app_for_stdout = app.clone();
    tokio::spawn(stream_lines(stdout, app_for_stdout, false));

    let app_for_stderr = app.clone();
    tokio::spawn(stream_lines(stderr, app_for_stderr, true));

    let app_for_done = app.clone();
    tokio::spawn(async move {
        match child.wait().await {
            Ok(status) if status.success() => {
                let _ = app_for_done.emit(EVENT_REINDEX_DONE, ());
            }
            Ok(status) => {
                let _ = app_for_done.emit(
                    EVENT_REINDEX_ERROR,
                    format!("reindex exited with code {status}"),
                );
            }
            Err(e) => {
                let _ = app_for_done.emit(EVENT_REINDEX_ERROR, e.to_string());
            }
        }
    });

    Ok(())
}

async fn stream_lines<R>(reader: R, app: AppHandle, is_stderr: bool)
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut buf = BufReader::new(reader).lines();
    while let Ok(Some(line)) = buf.next_line().await {
        if line.trim().is_empty() {
            continue;
        }
        let payload = if is_stderr {
            format!("[stderr] {line}")
        } else {
            line
        };
        let _ = app.emit(EVENT_REINDEX_PROGRESS, payload);
    }
}

fn resolve_cwd(cwd: Option<String>) -> String {
    let trimmed = cwd
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from);

    if let Some(dir) = trimmed {
        return dir;
    }

    dirs::home_dir()
        .map(|p: PathBuf| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| ".".to_string())
}

fn locate_memory_exe() -> Option<PathBuf> {
    if which("memory").is_some() {
        return Some(PathBuf::from("memory"));
    }

    let home = dirs::home_dir()?;
    let scripts_root = home.join("AppData").join("Local").join("Python");
    if let Ok(entries) = std::fs::read_dir(&scripts_root) {
        for e in entries.flatten() {
            let candidate = e.path().join("Scripts").join("memory.exe");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

fn which(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let exe_suffixes: &[&str] = if cfg!(windows) {
        &[".exe", ".cmd", ".bat", ""]
    } else {
        &[""]
    };
    for dir in std::env::split_paths(&path) {
        for suffix in exe_suffixes {
            let candidate = dir.join(format!("{name}{suffix}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}
