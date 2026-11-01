use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::agent::{self, AgentKind, Profile};
use crate::tooling::{paths, plugins};

const SYNC_PLUGIN: &str = "echo-memory";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KimiReadiness {
    pub cli: Option<String>,
    pub login: Option<String>,
    pub sync: Option<Value>,
    pub script: Option<String>,
    pub node: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum KimiTerminal {
    Login,
    Import,
}

fn lossy(p: PathBuf) -> String {
    p.to_string_lossy().into_owned()
}

pub fn login_at(kimi_home: &Path) -> Option<String> {
    let file = kimi_home.join("credentials").join("kimi-code.json");
    let v: Value = serde_json::from_str(&fs::read_to_string(&file).ok()?).ok()?;
    let signed = ["access_token", "refresh_token"].iter().any(|k| {
        v.get(k)
            .and_then(Value::as_str)
            .is_some_and(|s| !s.is_empty())
    });
    if !signed {
        return None;
    }
    let modified = fs::metadata(&file).and_then(|m| m.modified()).ok()?;
    Some(humantime::format_rfc3339_millis(modified).to_string())
}

pub fn sync_script(home: &Path) -> Option<PathBuf> {
    let (items, _) = plugins::read_installed(&paths::installed_plugins(home));
    items
        .into_iter()
        .filter(|p| p.name == SYNC_PLUGIN)
        .map(|p| p.install_path.join("bin").join("kimi-sync.mjs"))
        .find(|p| p.is_file())
}

fn node() -> Option<PathBuf> {
    agent::in_path("node.exe").or_else(|| {
        std::env::var_os("ProgramFiles")
            .map(|p| PathBuf::from(p).join("nodejs").join("node.exe"))
            .filter(|p| p.is_file())
    })
}

fn readiness() -> Result<KimiReadiness, String> {
    let home = agent::home().ok_or("Не найдена домашняя папка")?;
    let profile = Profile::of(AgentKind::Kimi, &home);
    let sync = fs::read_to_string(profile.home.join("echo-sync.json"))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok());
    Ok(KimiReadiness {
        cli: profile.find_cli().map(lossy),
        login: login_at(&profile.home),
        sync,
        script: sync_script(&home).map(lossy),
        node: node().map(lossy),
    })
}

#[tauri::command]
pub async fn kimi_readiness() -> Result<KimiReadiness, String> {
    tauri::async_runtime::spawn_blocking(readiness)
        .await
        .map_err(|e| e.to_string())?
}

pub fn plugin_failure(status: &Value, started: SystemTime) -> Option<String> {
    let at = status.get("at").and_then(Value::as_str)?;
    let synced = humantime::parse_rfc3339_weak(at).ok()? >= started;
    let error = status.get("pluginError").and_then(Value::as_str)?;
    synced.then(|| format!("Настройки перенесены, но плагин памяти не установлен: {error}"))
}

fn sync_all() -> Result<Option<String>, String> {
    let home = agent::home().ok_or("Не найдена домашняя папка")?;
    let script = sync_script(&home).ok_or("Не найден плагин echo-memory с kimi-sync.mjs")?;
    let node = node().ok_or("Не найден node.exe")?;
    let started = SystemTime::now() - Duration::from_secs(1);
    let mut cmd = Command::new(node);
    cmd.arg(&script).arg("--all").current_dir(&home);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd
        .output()
        .map_err(|e| format!("Не удалось запустить синхронизацию: {e}"))?;
    if out.status.success() {
        return Ok(None);
    }
    let status = fs::read_to_string(
        Profile::of(AgentKind::Kimi, &home)
            .home
            .join("echo-sync.json"),
    )
    .ok()
    .and_then(|t| serde_json::from_str::<Value>(&t).ok());
    if let Some(warning) = status.and_then(|s| plugin_failure(&s, started)) {
        return Ok(Some(warning));
    }
    let err = String::from_utf8_lossy(&out.stderr).trim().to_owned();
    Err(if err.is_empty() {
        format!("Синхронизация завершилась с кодом {:?}", out.status.code())
    } else {
        err
    })
}

#[tauri::command]
pub async fn kimi_sync_all() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(sync_all)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn kimi_open_terminal(app: AppHandle, action: KimiTerminal) -> Result<(), String> {
    let home = agent::home().ok_or("Не найдена домашняя папка")?;
    let profile = Profile::of(AgentKind::Kimi, &home);
    let cli = profile
        .find_cli()
        .ok_or_else(|| format!("{} не найден", profile.exe))?;
    let sub = match action {
        KimiTerminal::Login => "login",
        KimiTerminal::Import => "import-sessions",
    };
    super::system::spawn_wt(
        &app,
        &home.to_string_lossy(),
        &[cli.to_string_lossy().replace('\\', "/"), sub.to_string()],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn login_needs_a_stored_token() {
        let dir = tempfile::tempdir().unwrap();
        let kimi = dir.path();
        assert!(login_at(kimi).is_none());
        let file = kimi.join("credentials/kimi-code.json");
        write(&file, r#"{"access_token":"","refresh_token":""}"#);
        assert!(login_at(kimi).is_none());
        write(&file, r#"{"access_token":"","refresh_token":"r"}"#);
        assert!(login_at(kimi).is_some());
    }

    #[test]
    fn plugin_failure_is_a_warning_only_for_this_run() {
        let now = SystemTime::now();
        let fresh = humantime::format_rfc3339_millis(now + Duration::from_secs(2)).to_string();
        let old = humantime::format_rfc3339_millis(now - Duration::from_secs(60)).to_string();
        let failed = serde_json::json!({"at": fresh, "pluginError": "kimi web не поднялся"});
        assert!(plugin_failure(&failed, now).is_some_and(|w| w.contains("kimi web не поднялся")));
        let stale = serde_json::json!({"at": old, "pluginError": "x"});
        assert!(plugin_failure(&stale, now).is_none());
        let clean = serde_json::json!({"at": fresh, "pluginError": null});
        assert!(plugin_failure(&clean, now).is_none());
    }

    #[test]
    fn sync_script_comes_from_the_installed_memory_plugin() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let root = home.join("cache/echo-memory/0.2.1");
        write(&root.join("bin/kimi-sync.mjs"), "");
        let installed = serde_json::json!({
            "version": 2,
            "plugins": {
                "echo-memory@echo-studio": [{
                    "scope": "user",
                    "installPath": root.to_string_lossy(),
                    "version": "0.2.1"
                }]
            }
        });
        write(&paths::installed_plugins(home), &installed.to_string());
        assert_eq!(
            sync_script(home),
            Some(root.join("bin").join("kimi-sync.mjs"))
        );
    }
}
