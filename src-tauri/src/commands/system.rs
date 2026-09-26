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
