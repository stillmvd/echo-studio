use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use dirs::home_dir;

fn titles_path() -> Option<PathBuf> {
    home_dir().map(|h| h.join(".claude").join("echo-studio-titles.json"))
}

pub fn load_titles() -> HashMap<String, String> {
    let Some(path) = titles_path() else {
        return HashMap::new();
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return HashMap::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn set_title(session_id: &str, title: Option<String>) -> Result<(), String> {
    let path = titles_path().ok_or("cannot resolve home dir")?;
    let mut map = load_titles();

    match title {
        Some(t) if !t.trim().is_empty() => {
            map.insert(session_id.to_string(), t.trim().to_string());
        }
        _ => {
            map.remove(session_id);
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create_dir_all: {e}"))?;
    }

    let json = serde_json::to_string_pretty(&map).map_err(|e| format!("serialize: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}
