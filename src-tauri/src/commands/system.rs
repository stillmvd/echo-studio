use std::path::PathBuf;

use tauri::AppHandle;

#[tauri::command]
pub async fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(format!("Запись только в .md: {file_path}"));
    }
    std::fs::write(&path, content).map_err(|e| format!("Не удалось записать файл: {e}"))
}

#[tauri::command]
pub async fn reveal_in_explorer(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    if cfg!(windows) {
        app.shell()
            .command("explorer")
            .args([format!("/select,{path}")])
            .spawn()
            .map_err(|e| format!("Не удалось открыть Проводник: {e}"))?;
        Ok(())
    } else {
        Err("Только для Windows".into())
    }
}

#[tauri::command]
pub async fn open_in_claude_code(
    app: AppHandle,
    cwd: Option<String>,
    session_id: Option<String>,
    agent: Option<crate::agent::AgentKind>,
) -> Result<String, String> {
    let target_dir = resolve_cwd(cwd);
    if !std::path::Path::new(&target_dir).is_dir() {
        return Err(format!("Не папка: {target_dir}"));
    }
    use crate::agent::AgentKind;
    use crate::workbench::kimi;
    let kind = match session_id.as_deref() {
        Some(id) if kimi::is_session_id(id) => AgentKind::Kimi,
        Some(_) => AgentKind::Claude,
        None => agent.unwrap_or_else(crate::agent::current_kind),
    };
    let home = crate::agent::home().unwrap_or_default();
    let profile = crate::agent::Profile::of(kind, &home);
    let mut argv = vec![profile.command().to_string()];
    match session_id {
        Some(id) if is_session_id(&id) || kimi::is_session_id(&id) => {
            argv.extend(profile.resume_args(&id));
        }
        Some(id) => return Err(format!("Неверный id сессии: {id}")),
        None => {}
    }
    spawn_wt(&app, &target_dir, &argv)?;
    Ok(target_dir)
}

pub(crate) fn spawn_wt(app: &AppHandle, dir: &str, argv: &[String]) -> Result<(), String> {
    let mut args = vec!["-d".to_string(), dir.to_string()];
    match git_bash() {
        Some(bash) => {
            args.splice(
                0..0,
                ["--size", WINDOW_SIZE, "-p", "Git Bash"].map(String::from),
            );
            args.extend([
                bash.to_string_lossy().into_owned(),
                "-l".into(),
                "-c".into(),
                format!(
                    "{} \\; exec bash -l",
                    argv.iter()
                        .map(|a| sh_quote(a))
                        .collect::<Vec<_>>()
                        .join(" ")
                ),
            ]);
        }
        None => {
            args.splice(0..0, ["--size", WINDOW_SIZE].map(String::from));
            args.extend(argv.iter().cloned());
        }
    }

    use tauri_plugin_shell::ShellExt;
    app.shell()
        .command("wt")
        .args(args)
        .spawn()
        .map_err(|e| format!("Не удалось запустить `wt`: {e}"))?;
    Ok(())
}

const WINDOW_SIZE: &str = "120,43";

fn sh_quote(arg: &str) -> String {
    let safe = !arg.is_empty()
        && arg
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_./:=@".contains(c));
    if safe {
        arg.to_owned()
    } else {
        format!("'{}'", arg.replace('\'', r"'\''"))
    }
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
