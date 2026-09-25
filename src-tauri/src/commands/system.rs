use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::echovault::EchoVaultConfig;

pub const EVENT_REINDEX_PROGRESS: &str = "echovault://reindex-progress";
pub const EVENT_REINDEX_DONE: &str = "echovault://reindex-done";
pub const EVENT_REINDEX_ERROR: &str = "echovault://reindex-error";

#[tauri::command]
pub async fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(format!("refusing to write non-markdown file: {file_path}"));
    }
    std::fs::write(&path, content).map_err(|e| format!("write_text_file: {e}"))
}

#[tauri::command]
pub async fn read_echovault_config() -> Result<EchoVaultConfig, String> {
    crate::echovault::config::read_echovault_config()
}

#[tauri::command]
pub async fn reveal_in_explorer(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    if cfg!(windows) {
        app.shell()
            .command("explorer")
            .args([format!("/select,{path}")])
            .spawn()
            .map_err(|e| format!("spawn explorer: {e}"))?;
        Ok(())
    } else {
        Err("reveal_in_explorer is windows-only".into())
    }
}

#[tauri::command]
pub async fn open_in_claude_code(app: AppHandle, cwd: Option<String>) -> Result<String, String> {
    let target_dir = resolve_cwd(cwd);
    if !std::path::Path::new(&target_dir).is_dir() {
        return Err(format!("not a directory: {target_dir}"));
    }

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
    if let Ok(cfg) = crate::echovault::config::read_echovault_config() {
        if cfg.embedding_provider.eq_ignore_ascii_case("ollama") {
            let base = cfg
                .ollama_base_url
                .clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| "http://localhost:11434".to_string());
            if let Err(reason) = probe_ollama(&base).await {
                return Err(format!(
                    "Ollama недоступна по адресу {base} ({reason}). Запустите Ollama (`ollama serve`) и повторите reindex."
                ));
            }
        }
    }

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

    let stderr_tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

    let app_for_stdout = app.clone();
    tokio::spawn(stream_lines(stdout, app_for_stdout, false, None));

    let app_for_stderr = app.clone();
    tokio::spawn(stream_lines(
        stderr,
        app_for_stderr,
        true,
        Some(stderr_tail.clone()),
    ));

    let app_for_done = app.clone();
    tokio::spawn(async move {
        match child.wait().await {
            Ok(status) if status.success() => {
                let _ = app_for_done.emit(EVENT_REINDEX_DONE, ());
            }
            Ok(status) => {
                let tail = stderr_tail.lock().map(|b| b.join(" ")).unwrap_or_default();
                let _ = app_for_done.emit(
                    EVENT_REINDEX_ERROR,
                    summarize_failure(&status.to_string(), &tail),
                );
            }
            Err(e) => {
                let _ = app_for_done.emit(EVENT_REINDEX_ERROR, e.to_string());
            }
        }
    });

    Ok(())
}

async fn probe_ollama(base_url: &str) -> Result<(), String> {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|_| "нет соединения".to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("HTTP {}", resp.status()))
    }
}

fn summarize_failure(status: &str, stderr_tail: &str) -> String {
    let lower = stderr_tail.to_lowercase();
    if lower.contains("connecterror")
        || lower.contains("10061")
        || lower.contains("connection refused")
        || lower.contains("max retries")
    {
        return "Ollama недоступна — embeddings не получены. Запустите Ollama и повторите reindex."
            .to_string();
    }
    if stderr_tail.trim().is_empty() {
        format!("reindex завершился с ошибкой ({status})")
    } else {
        format!("reindex: {stderr_tail}")
    }
}

async fn stream_lines<R>(
    reader: R,
    app: AppHandle,
    is_stderr: bool,
    tail: Option<Arc<Mutex<Vec<String>>>>,
) where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut buf = BufReader::new(reader).lines();
    while let Ok(Some(line)) = buf.next_line().await {
        if line.trim().is_empty() {
            continue;
        }
        if let Some(ref tail) = tail {
            if let Ok(mut t) = tail.lock() {
                t.push(line.clone());
                let len = t.len();
                if len > 5 {
                    t.drain(0..len - 5);
                }
            }
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
