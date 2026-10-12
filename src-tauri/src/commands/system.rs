use std::path::PathBuf;

use tauri::AppHandle;

#[tauri::command]
pub async fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(format!("refusing to write non-markdown file: {file_path}"));
    }
    std::fs::write(&path, content).map_err(|e| format!("write_text_file: {e}"))
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
pub async fn open_in_claude_code(
    app: AppHandle,
    cwd: Option<String>,
    session_id: Option<String>,
) -> Result<String, String> {
    let target_dir = resolve_cwd(cwd);
    if !std::path::Path::new(&target_dir).is_dir() {
        return Err(format!("not a directory: {target_dir}"));
    }
    let claude = match session_id {
        Some(id) if is_session_id(&id) => format!("claude --resume {id}"),
        Some(id) => return Err(format!("invalid session id: {id}")),
        None => "claude".to_string(),
    };

    let mut args = vec!["-d".to_string(), target_dir.clone()];
    match git_bash() {
        Some(bash) => {
            args.splice(0..0, ["-p".to_string(), "Git Bash".to_string()]);
            args.extend([
                bash.to_string_lossy().into_owned(),
                "-l".into(),
                "-c".into(),
                format!("{claude} \\; exec bash -l"),
            ]);
        }
        None => args.extend(claude.split(' ').map(String::from)),
    }

    use tauri_plugin_shell::ShellExt;
    app.shell()
        .command("wt")
        .args(args)
        .spawn()
        .map_err(|e| format!("failed to spawn `wt`: {e}"))?;

    Ok(target_dir)
}

fn is_session_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn git_bash() -> Option<PathBuf> {
    std::env::var_os("CLAUDE_CODE_GIT_BASH_PATH")
        .map(PathBuf::from)
        .into_iter()
        .chain(std::env::var_os("ProgramFiles").map(|p| PathBuf::from(p).join(r"Git\bin\bash.exe")))
        .find(|p| p.is_file())
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
