use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn open_in_claude_code(app: AppHandle, cwd: Option<String>) -> Result<String, String> {
    let target_dir = resolve_cwd(cwd);

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
