use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::paths::projects_root;

const SUMMARY_MAX: usize = 240;
const SEARCH_MAX_HITS: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEvent {
    pub uuid: String,
    pub parent_uuid: Option<String>,
    pub timestamp: Option<String>,
    pub event_type: String,
    pub subtype: Option<String>,
    pub role: Option<String>,
    pub summary: String,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSearchHit {
    pub session_id: String,
    pub file_path: String,
    pub uuid: String,
    pub timestamp: Option<String>,
    pub event_type: String,
    pub preview: String,
}

pub fn read_session(file_path: &Path) -> Result<Vec<SessionEvent>, String> {
    let file = fs::File::open(file_path).map_err(|e| format!("open: {e}"))?;
    let reader = BufReader::new(file);
    let mut events = Vec::new();
    for line in reader.lines().map_while(|l| l.ok()) {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some(ev) = parse_event(value) {
            events.push(ev);
        }
    }
    Ok(events)
}

pub fn search_in_sessions(project_id: &str, query: &str) -> Vec<SessionSearchHit> {
    let trimmed = query.trim().to_lowercase();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let Some(root) = projects_root() else {
        return Vec::new();
    };
    let dir = root.join(project_id);
    if !dir.is_dir() {
        return Vec::new();
    }

    let mut hits = Vec::<SessionSearchHit>::new();
    let Ok(entries) = fs::read_dir(&dir) else {
        return hits;
    };
    let files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("jsonl"))
        .collect();

    for path in files {
        if hits.len() >= SEARCH_MAX_HITS {
            break;
        }
        let session_id = path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let Ok(file) = fs::File::open(&path) else {
            continue;
        };
        let reader = BufReader::new(file);
        for line in reader.lines().map_while(|l| l.ok()) {
            if hits.len() >= SEARCH_MAX_HITS {
                break;
            }
            if line.trim().is_empty() {
                continue;
            }
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let Some(ev) = parse_event(value) else {
                continue;
            };
            if ev.summary.to_lowercase().contains(&trimmed) {
                hits.push(SessionSearchHit {
                    session_id: session_id.clone(),
                    file_path: path.to_string_lossy().to_string(),
                    uuid: ev.uuid,
                    timestamp: ev.timestamp,
                    event_type: ev.event_type,
                    preview: truncate(&ev.summary, SUMMARY_MAX),
                });
            }
        }
    }

    hits
}

fn parse_event(raw: Value) -> Option<SessionEvent> {
    let event_type = raw.get("type").and_then(|v| v.as_str())?.to_string();
    if event_type == "file-history-snapshot" {
        return None;
    }
    let uuid = raw
        .get("uuid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let parent_uuid = raw
        .get("parentUuid")
        .and_then(|v| v.as_str())
        .map(String::from);
    let timestamp = raw
        .get("timestamp")
        .and_then(|v| v.as_str())
        .map(String::from);
    let subtype = raw
        .get("subtype")
        .and_then(|v| v.as_str())
        .map(String::from);

    let (role, summary) = extract_summary(&event_type, subtype.as_deref(), &raw);

    Some(SessionEvent {
        uuid,
        parent_uuid,
        timestamp,
        event_type,
        subtype,
        role,
        summary,
        raw,
    })
}

fn extract_summary(
    event_type: &str,
    subtype: Option<&str>,
    raw: &Value,
) -> (Option<String>, String) {
    match event_type {
        "user" | "assistant" => {
            let role = raw
                .pointer("/message/role")
                .and_then(|v| v.as_str())
                .map(String::from)
                .or_else(|| Some(event_type.to_string()));
            let content = raw.pointer("/message/content");
            let text = match content {
                Some(Value::String(s)) => s.clone(),
                Some(Value::Array(blocks)) => extract_blocks_text(blocks),
                _ => String::new(),
            };
            (role, truncate(&text, SUMMARY_MAX))
        }
        "tool_use" => {
            let name = raw.get("name").and_then(|v| v.as_str()).unwrap_or("?");
            let keys: Vec<String> = raw
                .get("input")
                .and_then(|v| v.as_object())
                .map(|m| m.keys().cloned().collect())
                .unwrap_or_default();
            (
                Some("tool".into()),
                truncate(&format!("{name}({})", keys.join(", ")), SUMMARY_MAX),
            )
        }
        "tool_result" => {
            let content = raw
                .get("content")
                .and_then(|v| match v {
                    Value::String(s) => Some(s.clone()),
                    Value::Array(arr) => Some(extract_blocks_text(arr)),
                    _ => None,
                })
                .unwrap_or_default();
            (Some("tool".into()), truncate(&content, SUMMARY_MAX))
        }
        "system" => {
            let detail = match subtype {
                Some("turn_duration") => raw
                    .get("durationMs")
                    .and_then(|v| v.as_i64())
                    .map(|d| format!("{d} ms"))
                    .unwrap_or_default(),
                Some("away_summary") => raw
                    .get("content")
                    .and_then(|v| v.as_str())
                    .map(String::from)
                    .unwrap_or_default(),
                Some("stop_hook_summary") => raw
                    .get("stopReason")
                    .and_then(|v| v.as_str())
                    .map(String::from)
                    .unwrap_or_default(),
                _ => String::new(),
            };
            let label = subtype.unwrap_or("system");
            let s = if detail.is_empty() {
                label.to_string()
            } else {
                format!("{label}: {detail}")
            };
            (None, truncate(&s, SUMMARY_MAX))
        }
        _ => (None, truncate(&raw.to_string(), SUMMARY_MAX)),
    }
}

fn extract_blocks_text(blocks: &[Value]) -> String {
    let mut parts: Vec<String> = Vec::new();
    for b in blocks {
        let kind = b.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match kind {
            "text" => {
                if let Some(t) = b.get("text").and_then(|v| v.as_str()) {
                    parts.push(t.to_string());
                }
            }
            "tool_use" => {
                let name = b.get("name").and_then(|v| v.as_str()).unwrap_or("?");
                parts.push(format!("[tool_use: {name}]"));
            }
            "tool_result" => {
                let content = b.get("content").and_then(|v| match v {
                    Value::String(s) => Some(s.clone()),
                    Value::Array(arr) => Some(extract_blocks_text(arr)),
                    _ => None,
                });
                if let Some(c) = content {
                    parts.push(format!("[tool_result: {c}]"));
                }
            }
            _ => {}
        }
    }
    parts.join(" ")
}

fn truncate(s: &str, max: usize) -> String {
    let collapsed = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= max {
        return collapsed;
    }
    let taken: String = collapsed.chars().take(max).collect();
    format!("{taken}…")
}
