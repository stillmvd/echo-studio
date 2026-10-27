use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

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
    let path = titles_path().ok_or("Не найдена домашняя папка")?;
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
        fs::create_dir_all(parent).map_err(|e| format!("Не удалось создать папку: {e}"))?;
    }

    let json = serde_json::to_string_pretty(&map)
        .map_err(|e| format!("Не удалось сохранить JSON: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("Не удалось записать временный файл: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Не удалось переименовать файл: {e}"))?;
    Ok(())
}

pub fn append_custom_title(path: &Path, session_id: &str, title: &str) -> Result<(), String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Пустое название".into());
    }
    let line = serde_json::json!({
        "type": "custom-title",
        "customTitle": title,
        "sessionId": session_id,
    });
    let mut file = fs::OpenOptions::new()
        .read(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Не удалось открыть {}: {e}", path.display()))?;
    let mut text = String::new();
    if file.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
        let mut last = [0u8; 1];
        file.seek(SeekFrom::End(-1))
            .and_then(|_| file.read_exact(&mut last))
            .map_err(|e| format!("Не удалось прочитать {}: {e}", path.display()))?;
        if last[0] != b'\n' {
            text.push('\n');
        }
    }
    text.push_str(&line.to_string());
    text.push('\n');
    file.write_all(text.as_bytes())
        .map_err(|e| format!("Не удалось дописать в {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appends_custom_title_on_its_own_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.jsonl");
        fs::write(&path, "{\"type\":\"user\"}").unwrap();
        append_custom_title(&path, "abc", "  Тема  ").unwrap();
        let text = fs::read_to_string(&path).unwrap();
        let last: serde_json::Value = serde_json::from_str(text.lines().last().unwrap()).unwrap();
        assert_eq!(text.lines().count(), 2);
        assert_eq!(last["type"], "custom-title");
        assert_eq!(last["customTitle"], "Тема");
        assert_eq!(last["sessionId"], "abc");
        assert!(append_custom_title(&path, "abc", " ").is_err());
    }
}
