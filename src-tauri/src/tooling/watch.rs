use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter};

use super::paths::{claude_dir, claude_json, installed_plugins};
use super::settings::read_json;
use super::ScopeRef;

pub const EVENT_CHANGED: &str = "tooling://changed";
const MCP_KEYS: [&str; 4] = [
    "mcpServers",
    "disabledMcpServers",
    "disabledMcpjsonServers",
    "enabledMcpjsonServers",
];

fn pick(obj: &Value) -> Value {
    let mut out = Map::new();
    for key in MCP_KEYS {
        if let Some(v) = obj.get(key) {
            out.insert(key.to_string(), v.clone());
        }
    }
    Value::Object(out)
}

pub fn mcp_slice(root: Option<&Value>) -> Value {
    let Some(root) = root else {
        return Value::Null;
    };
    let projects: Map<String, Value> = root
        .get("projects")
        .and_then(Value::as_object)
        .map(|m| m.iter().map(|(k, v)| (k.clone(), pick(v))).collect())
        .unwrap_or_default();
    serde_json::json!({ "root": pick(root), "projects": projects })
}

pub fn targets(home: &Path, scopes: &[ScopeRef]) -> Vec<(PathBuf, RecursiveMode)> {
    let claude = claude_dir(home);
    let mut out: Vec<(PathBuf, RecursiveMode)> = ["skills", "commands", "agents"]
        .iter()
        .map(|d| (claude.join(d), RecursiveMode::Recursive))
        .collect();
    out.push((claude.join("settings.json"), RecursiveMode::NonRecursive));
    out.push((installed_plugins(home), RecursiveMode::NonRecursive));
    out.push((claude_json(home), RecursiveMode::NonRecursive));
    for scope in scopes.iter().filter(|s| s.available) {
        let Some(p) = scope.path.as_deref().map(PathBuf::from) else {
            continue;
        };
        let project_claude = p.join(".claude");
        if project_claude != claude {
            out.push((project_claude, RecursiveMode::Recursive));
        }
        out.push((p.join(".mcp.json"), RecursiveMode::NonRecursive));
    }
    out.retain(|(p, _)| p.exists());
    out
}

pub fn start(app: AppHandle, home: PathBuf, scopes: Vec<ScopeRef>) {
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<DebounceEventResult>();
        let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[echo-studio] tooling watcher: {e}");
                return;
            }
        };
        for (path, mode) in targets(&home, &scopes) {
            if let Err(e) = debouncer.watcher().watch(&path, mode) {
                eprintln!("[echo-studio] watch {}: {e}", path.display());
            }
        }
        let cj_path = claude_json(&home);
        let mut last_slice = mcp_slice(read_json(&cj_path).ok().flatten().as_ref());
        for events in rx {
            let Ok(events) = events else { continue };
            let mut relevant = false;
            let mut claude_json_touched = false;
            for e in &events {
                if e.path == cj_path {
                    claude_json_touched = true;
                } else if !e
                    .path
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().ends_with(".echo-studio.tmp"))
                {
                    relevant = true;
                }
            }
            if claude_json_touched {
                let slice = mcp_slice(read_json(&cj_path).ok().flatten().as_ref());
                if slice != last_slice {
                    last_slice = slice;
                    relevant = true;
                }
            }
            if relevant {
                let _ = app.emit(EVENT_CHANGED, ());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn slice_ignores_noise_keys() {
        let a = json!({ "numStartups": 1, "mcpServers": { "x": {} }, "projects": { "C:/p": { "lastCost": 1, "disabledMcpServers": ["x"] } } });
        let b = json!({ "numStartups": 2, "mcpServers": { "x": {} }, "projects": { "C:/p": { "lastCost": 9, "disabledMcpServers": ["x"] } } });
        let c = json!({ "numStartups": 2, "mcpServers": { "x": {} }, "projects": { "C:/p": { "lastCost": 9, "disabledMcpServers": [] } } });
        assert_eq!(mcp_slice(Some(&a)), mcp_slice(Some(&b)));
        assert_ne!(mcp_slice(Some(&b)), mcp_slice(Some(&c)));
    }

    #[test]
    fn targets_skip_missing_paths() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(home.path().join(".claude").join("skills")).unwrap();
        std::fs::write(home.path().join(".claude.json"), "{}").unwrap();
        let t = targets(home.path(), &[]);
        let names: Vec<String> = t
            .iter()
            .map(|(p, _)| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["skills", ".claude.json"]);
    }
}
