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
pub struct DisplayItem {
    pub uuid: String,
    pub parent_uuid: Option<String>,
    pub timestamp: Option<String>,
    pub kind: String,
    pub role: String,
    pub text: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input_summary: Option<String>,
    pub tool_input_json: Option<Value>,
    pub is_error: Option<bool>,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSearchHit {
    pub session_id: String,
    pub file_path: String,
    pub uuid: String,
    pub timestamp: Option<String>,
    pub kind: String,
    pub preview: String,
}

pub fn read_session(file_path: &Path) -> Result<Vec<DisplayItem>, String> {
    let file = fs::File::open(file_path).map_err(|e| format!("open: {e}"))?;
    let reader = BufReader::new(file);
    let mut items = Vec::new();
    for line in reader.lines().map_while(|l| l.ok()) {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        flatten_into(value, &mut items);
    }
    Ok(items)
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
            let mut local = Vec::new();
            flatten_into(value, &mut local);
            for item in local {
                if hits.len() >= SEARCH_MAX_HITS {
                    break;
                }
                let haystack = item
                    .text
                    .clone()
                    .or_else(|| item.tool_input_summary.clone())
                    .unwrap_or_default();
                if haystack.to_lowercase().contains(&trimmed) {
                    hits.push(SessionSearchHit {
                        session_id: session_id.clone(),
                        file_path: path.to_string_lossy().to_string(),
                        uuid: item.uuid.clone(),
                        timestamp: item.timestamp.clone(),
                        kind: item.kind.clone(),
                        preview: truncate(&haystack, SUMMARY_MAX),
                    });
                }
            }
        }
    }

    hits
}

fn flatten_into(raw: Value, out: &mut Vec<DisplayItem>) {
    let event_type = raw
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if event_type == "file-history-snapshot" {
        return;
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

    match event_type.as_str() {
        "user" | "assistant" => {
            let role = raw
                .pointer("/message/role")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_else(|| event_type.clone());
            let content = raw.pointer("/message/content").cloned();
            match content {
                Some(Value::String(s)) => {
                    out.push(DisplayItem {
                        uuid: uuid.clone(),
                        parent_uuid: parent_uuid.clone(),
                        timestamp: timestamp.clone(),
                        kind: format!("{role}_text"),
                        role: role.clone(),
                        text: Some(s),
                        tool_name: None,
                        tool_input_summary: None,
                        tool_input_json: None,
                        is_error: None,
                        raw: raw.clone(),
                    });
                }
                Some(Value::Array(blocks)) => {
                    for (idx, block) in blocks.iter().enumerate() {
                        if let Some(item) = block_to_display(
                            block,
                            &uuid,
                            idx,
                            &parent_uuid,
                            &timestamp,
                            &role,
                            &raw,
                        ) {
                            out.push(item);
                        }
                    }
                }
                _ => {}
            }
        }
        "system" => {
            let subtype = raw
                .get("subtype")
                .and_then(|v| v.as_str())
                .unwrap_or("system");
            let detail = system_detail(subtype, &raw);
            out.push(DisplayItem {
                uuid,
                parent_uuid,
                timestamp,
                kind: format!("system_{subtype}"),
                role: "system".into(),
                text: Some(detail),
                tool_name: None,
                tool_input_summary: None,
                tool_input_json: None,
                is_error: None,
                raw,
            });
        }
        _ => {
            out.push(DisplayItem {
                uuid,
                parent_uuid,
                timestamp,
                kind: format!("meta_{event_type}"),
                role: "system".into(),
                text: None,
                tool_name: None,
                tool_input_summary: None,
                tool_input_json: None,
                is_error: None,
                raw,
            });
        }
    }
}

fn block_to_display(
    block: &Value,
    parent_uuid_str: &str,
    idx: usize,
    parent_uuid: &Option<String>,
    timestamp: &Option<String>,
    role: &str,
    raw: &Value,
) -> Option<DisplayItem> {
    let block_type = block.get("type").and_then(|v| v.as_str())?;
    let uuid = format!("{parent_uuid_str}:{idx}");

    match block_type {
        "text" => {
            let text = block.get("text").and_then(|v| v.as_str())?.to_string();
            Some(DisplayItem {
                uuid,
                parent_uuid: parent_uuid.clone(),
                timestamp: timestamp.clone(),
                kind: format!("{role}_text"),
                role: role.into(),
                text: Some(text),
                tool_name: None,
                tool_input_summary: None,
                tool_input_json: None,
                is_error: None,
                raw: raw.clone(),
            })
        }
        "thinking" => {
            let text = block
                .get("thinking")
                .and_then(|v| v.as_str())
                .or_else(|| block.get("text").and_then(|v| v.as_str()))?
                .to_string();
            Some(DisplayItem {
                uuid,
                parent_uuid: parent_uuid.clone(),
                timestamp: timestamp.clone(),
                kind: "thinking".into(),
                role: role.into(),
                text: Some(text),
                tool_name: None,
                tool_input_summary: None,
                tool_input_json: None,
                is_error: None,
                raw: raw.clone(),
            })
        }
        "tool_use" => {
            let name = block
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("?")
                .to_string();
            let input = block.get("input").cloned().unwrap_or(Value::Null);
            let summary = tool_input_summary(&name, &input);
            Some(DisplayItem {
                uuid,
                parent_uuid: parent_uuid.clone(),
                timestamp: timestamp.clone(),
                kind: "tool_use".into(),
                role: role.into(),
                text: None,
                tool_name: Some(name),
                tool_input_summary: Some(summary),
                tool_input_json: Some(input),
                is_error: None,
                raw: raw.clone(),
            })
        }
        "tool_result" => {
            let is_error = block.get("is_error").and_then(|v| v.as_bool());
            let content = block.get("content");
            let text = match content {
                Some(Value::String(s)) => s.clone(),
                Some(Value::Array(arr)) => arr
                    .iter()
                    .filter_map(|b| {
                        b.get("text")
                            .or_else(|| b.get("content"))
                            .and_then(|v| v.as_str())
                            .map(String::from)
                    })
                    .collect::<Vec<_>>()
                    .join("\n"),
                _ => String::new(),
            };
            Some(DisplayItem {
                uuid,
                parent_uuid: parent_uuid.clone(),
                timestamp: timestamp.clone(),
                kind: "tool_result".into(),
                role: role.into(),
                text: Some(text),
                tool_name: None,
                tool_input_summary: None,
                tool_input_json: None,
                is_error,
                raw: raw.clone(),
            })
        }
        "image" => Some(DisplayItem {
            uuid,
            parent_uuid: parent_uuid.clone(),
            timestamp: timestamp.clone(),
            kind: "image".into(),
            role: role.into(),
            text: Some("[image]".into()),
            tool_name: None,
            tool_input_summary: None,
            tool_input_json: None,
            is_error: None,
            raw: raw.clone(),
        }),
        _ => Some(DisplayItem {
            uuid,
            parent_uuid: parent_uuid.clone(),
            timestamp: timestamp.clone(),
            kind: format!("block_{block_type}"),
            role: role.into(),
            text: None,
            tool_name: None,
            tool_input_summary: None,
            tool_input_json: None,
            is_error: None,
            raw: block.clone(),
        }),
    }
}

fn tool_input_summary(name: &str, input: &Value) -> String {
    let s = |key: &str| input.get(key).and_then(|v| v.as_str()).map(String::from);
    let primary = match name {
        "Bash" | "PowerShell" => s("command"),
        "Read" | "Write" | "Edit" => s("file_path"),
        "Glob" => s("pattern"),
        "Grep" => s("pattern").map(|p| match s("path") {
            Some(path) => format!("{p}  in {path}"),
            None => p,
        }),
        "WebFetch" => s("url"),
        "WebSearch" => s("query"),
        "TodoWrite" => input
            .get("todos")
            .and_then(|v| v.as_array())
            .map(|a| format!("{} todos", a.len())),
        "Task" => s("description").or_else(|| s("prompt")),
        "ExitPlanMode" => s("plan"),
        _ => None,
    };

    match primary {
        Some(p) => truncate(&p, SUMMARY_MAX),
        None => {
            if let Some(obj) = input.as_object() {
                if let Some((k, v)) = obj.iter().next() {
                    let val = match v {
                        Value::String(s) => s.clone(),
                        other => other.to_string(),
                    };
                    return truncate(&format!("{k}={val}"), SUMMARY_MAX);
                }
            }
            String::new()
        }
    }
}

fn system_detail(subtype: &str, raw: &Value) -> String {
    match subtype {
        "turn_duration" => raw
            .get("durationMs")
            .and_then(|v| v.as_i64())
            .map(|d| format!("turn took {d} ms"))
            .unwrap_or_default(),
        "stop_hook_summary" => raw
            .get("stopReason")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .into(),
        "away_summary" => raw
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .into(),
        _ => String::new(),
    }
}

fn truncate(s: &str, max: usize) -> String {
    let collapsed: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= max {
        return collapsed;
    }
    let taken: String = collapsed.chars().take(max).collect();
    format!("{taken}…")
}
