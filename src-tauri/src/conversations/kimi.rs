use std::collections::HashMap;
use std::fs;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

use serde_json::{json, Value};

use super::models::{ConversationProject, SessionMeta};
use super::paths::display_name;
use super::reader::{flatten_into, jsonl_lines, snippet_around, DisplayItem, SessionSearchHit};
use crate::agent::{self, AgentKind, Profile};

const WIRE: &str = "wire.jsonl";
const SEARCH_MAX_HITS: usize = 200;
const SUMMARY_MAX: usize = 240;
const PROMPT_MAX: usize = 2000;

pub fn sessions_root() -> Option<PathBuf> {
    agent::home().map(|h| Profile::of(AgentKind::Kimi, &h).sessions)
}

pub fn is_project_id(id: &str) -> bool {
    (id.starts_with("wd_") || id.starts_with("wm_"))
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
        && !id.contains("..")
}

pub fn is_wire(path: &Path) -> bool {
    let Some(root) = sessions_root().and_then(|r| r.canonicalize().ok()) else {
        return false;
    };
    path.canonicalize().is_ok_and(|p| {
        p.starts_with(&root) && p.file_name().is_some_and(|n| n == WIRE) && p.is_file()
    })
}

fn wire_of(session_dir: &Path) -> PathBuf {
    session_dir.join("agents").join("main").join(WIRE)
}

fn iso_ms(ms: u64) -> String {
    humantime::format_rfc3339_millis(UNIX_EPOCH + Duration::from_millis(ms)).to_string()
}

fn time_of(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::Number(n) => n
            .as_u64()
            .map(|ms| if ms < 100_000_000_000 { ms * 1000 } else { ms })
            .or_else(|| {
                n.as_f64()
                    .filter(|f| *f > 0.0)
                    .map(|f| (if f < 1e11 { f * 1000.0 } else { f }) as u64)
            })
            .map(iso_ms),
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

fn read_state(session_dir: &Path) -> Value {
    fs::read_to_string(session_dir.join("state.json"))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(Value::Null)
}

fn state_cwd(state: &Value) -> Option<String> {
    state
        .get("workDir")
        .or_else(|| state.get("cwd"))
        .and_then(|v| v.as_str())
        .map(|s| s.replace('/', "\\"))
}

fn is_service(text: &str) -> bool {
    let t = text.trim_start();
    t.starts_with("<system-reminder") || t.starts_with("<hook_result")
}

fn user_parts(message: &Value) -> Vec<Value> {
    message
        .get("content")
        .and_then(|c| c.as_array())
        .map(|parts| {
            parts
                .iter()
                .filter(|p| p.get("type").and_then(|t| t.as_str()) == Some("text"))
                .filter(|p| {
                    p.get("text")
                        .and_then(|t| t.as_str())
                        .is_some_and(|t| !is_service(t))
                })
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

fn result_text(result: &Value) -> String {
    match result {
        Value::String(s) => s.clone(),
        Value::Object(o) => o
            .get("output")
            .or_else(|| o.get("error"))
            .or_else(|| o.get("content"))
            .map(|v| match v {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .unwrap_or_else(|| result.to_string()),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

pub fn to_claude(record: &Value, index: usize) -> Option<Value> {
    let timestamp = time_of(record.get("time"));
    let kind = record.get("type").and_then(|t| t.as_str())?;
    if kind == "context.append_message" {
        let message = record.get("message")?;
        if message.get("role").and_then(|r| r.as_str()) != Some("user") {
            return None;
        }
        let parts = user_parts(message);
        if parts.is_empty() {
            return None;
        }
        return Some(json!({
            "type": "user",
            "uuid": format!("k{index}"),
            "timestamp": timestamp,
            "message": { "role": "user", "content": parts },
        }));
    }
    if kind != "context.append_loop_event" {
        return None;
    }
    let event = record.get("event")?;
    let uuid = event
        .get("uuid")
        .and_then(|u| u.as_str())
        .map_or_else(|| format!("k{index}"), String::from);
    let assistant = |block: Value| {
        json!({
            "type": "assistant",
            "uuid": uuid,
            "timestamp": timestamp,
            "message": { "role": "assistant", "content": [block] },
        })
    };
    match event.get("type").and_then(|t| t.as_str())? {
        "content.part" => {
            let part = event.get("part")?;
            match part.get("type").and_then(|t| t.as_str())? {
                "text" => Some(assistant(
                    json!({ "type": "text", "text": part.get("text")? }),
                )),
                "think" => Some(assistant(
                    json!({ "type": "thinking", "thinking": part.get("think")? }),
                )),
                _ => None,
            }
        }
        "tool.call" => Some(assistant(json!({
            "type": "tool_use",
            "id": event.get("toolCallId"),
            "name": event.get("name")?,
            "input": event.get("args").cloned().unwrap_or(Value::Null),
        }))),
        "tool.result" => {
            let result = event.get("result").cloned().unwrap_or(Value::Null);
            let is_error = result.get("error").is_some()
                || result.get("isError").and_then(|v| v.as_bool()) == Some(true);
            Some(json!({
                "type": "user",
                "uuid": uuid,
                "timestamp": timestamp,
                "message": { "role": "user", "content": [{
                    "type": "tool_result",
                    "tool_use_id": event.get("toolCallId"),
                    "content": result_text(&result),
                    "is_error": is_error,
                }]},
            }))
        }
        _ => None,
    }
}

fn wire_values(path: &Path) -> Result<Vec<Value>, String> {
    let file = fs::File::open(path).map_err(|e| format!("Не удалось открыть файл: {e}"))?;
    Ok(jsonl_lines(BufReader::new(file))
        .filter_map(|line| serde_json::from_str::<Value>(&line).ok())
        .collect())
}

fn as_claude(values: &[Value]) -> Vec<Value> {
    values
        .iter()
        .enumerate()
        .filter_map(|(i, v)| to_claude(v, i))
        .collect()
}

fn claude_lines(path: &Path) -> Result<Vec<Value>, String> {
    wire_values(path).map(|v| as_claude(&v))
}

fn turn_time(values: &[Value]) -> i64 {
    values
        .iter()
        .filter(|v| v.get("type").and_then(|t| t.as_str()) == Some("turn.ended"))
        .filter_map(|v| v.get("durationMs").and_then(|d| d.as_i64()))
        .sum()
}

pub fn read_session(path: &Path) -> Result<Vec<DisplayItem>, String> {
    let mut items = Vec::new();
    for value in claude_lines(path)? {
        flatten_into(value, &mut items);
    }
    Ok(items)
}

fn text_of(value: &Value, block: &str) -> Option<String> {
    value
        .pointer("/message/content")?
        .as_array()?
        .iter()
        .find(|b| b.get("type").and_then(|t| t.as_str()) == Some(block))
        .and_then(|b| b.get("text"))
        .and_then(|t| t.as_str())
        .map(|t| t.chars().take(PROMPT_MAX).collect())
}

fn session_meta(session_dir: &Path) -> Option<SessionMeta> {
    let wire = wire_of(session_dir);
    let size = fs::metadata(&wire).ok()?.len();
    let session_id = session_dir.file_name()?.to_string_lossy().into_owned();
    let state = read_state(session_dir);
    let raw = wire_values(&wire).unwrap_or_default();
    let duration_ms = turn_time(&raw);
    let lines = as_claude(&raw);
    let message_count = lines
        .iter()
        .filter(|v| {
            v.get("type").and_then(|t| t.as_str()) == Some("assistant")
                || text_of(v, "text").is_some()
        })
        .count() as u32;
    let first_prompt = lines
        .iter()
        .filter(|v| v.get("type").and_then(|t| t.as_str()) == Some("user"))
        .find_map(|v| text_of(v, "text"));
    let first_reply = lines
        .iter()
        .filter(|v| v.get("type").and_then(|t| t.as_str()) == Some("assistant"))
        .find_map(|v| text_of(v, "text"));
    let stamp = |v: &Value| {
        v.get("timestamp")
            .and_then(|t| t.as_str())
            .map(String::from)
    };
    let first_event_at = time_of(state.get("createdAt")).or_else(|| lines.iter().find_map(stamp));
    let last_event_at =
        time_of(state.get("updatedAt")).or_else(|| lines.iter().rev().find_map(stamp));
    let title = state
        .get("title")
        .and_then(|t| t.as_str())
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(String::from);
    let custom = state.get("isCustomTitle").and_then(|v| v.as_bool()) == Some(true);
    Some(SessionMeta {
        session_id,
        file_path: wire.to_string_lossy().into_owned(),
        size_bytes: size,
        message_count,
        first_event_at,
        last_event_at,
        duration_ms,
        git_branch: None,
        cwd: state_cwd(&state),
        custom_title: title.clone().filter(|_| custom),
        ai_title: title.filter(|_| !custom),
        user_title: None,
        first_prompt,
        first_reply,
    })
}

fn session_dirs(project: &Path) -> Vec<PathBuf> {
    fs::read_dir(project)
        .map(|it| {
            it.flatten()
                .map(|e| e.path())
                .filter(|p| {
                    p.file_name()
                        .is_some_and(|n| n.to_string_lossy().starts_with("session_"))
                        && wire_of(p).is_file()
                })
                .collect()
        })
        .unwrap_or_default()
}

fn index_dirs() -> HashMap<String, String> {
    let Some(home) = agent::home() else {
        return HashMap::new();
    };
    let profile = Profile::of(AgentKind::Kimi, &home);
    let index = fs::read_to_string(profile.home.join("session_index.jsonl")).unwrap_or_default();
    crate::workbench::kimi::work_dirs(&index)
}

pub fn list_projects() -> Vec<ConversationProject> {
    let Some(root) = sessions_root() else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(&root) else {
        return Vec::new();
    };
    let index = index_dirs();
    let mut projects: Vec<ConversationProject> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .filter_map(|dir| {
            let id = dir.file_name()?.to_string_lossy().into_owned();
            if !is_project_id(&id) {
                return None;
            }
            let sessions = session_dirs(&dir);
            if sessions.is_empty() {
                return None;
            }
            let mut cwd = None;
            let mut last: Option<String> = None;
            let mut total = 0;
            for s in &sessions {
                total += fs::metadata(wire_of(s)).map(|m| m.len()).unwrap_or(0);
                let state = read_state(s);
                let name = s.file_name().map(|n| n.to_string_lossy().into_owned());
                cwd = cwd
                    .or_else(|| state_cwd(&state))
                    .or_else(|| name.and_then(|n| index.get(&n).cloned()));
                if let Some(t) = time_of(state.get("updatedAt")) {
                    if last.as_ref().is_none_or(|l| &t > l) {
                        last = Some(t);
                    }
                }
            }
            let display = cwd
                .as_deref()
                .map_or_else(|| "Папка не найдена".to_owned(), display_name);
            Some(ConversationProject {
                display_name: display,
                cwd: cwd.unwrap_or_default(),
                id,
                session_count: sessions.len(),
                total_size: total,
                last_activity: last,
            })
        })
        .collect();
    projects.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));
    projects
}

pub fn list_sessions(project_id: &str) -> Vec<SessionMeta> {
    if !is_project_id(project_id) {
        return Vec::new();
    }
    let Some(root) = sessions_root() else {
        return Vec::new();
    };
    let mut list: Vec<SessionMeta> = session_dirs(&root.join(project_id))
        .iter()
        .filter_map(|d| session_meta(d))
        .collect();
    list.sort_by(|a, b| b.last_event_at.cmp(&a.last_event_at));
    list
}

pub fn search(project_id: &str, query: &str) -> Vec<SessionSearchHit> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() || !is_project_id(project_id) {
        return Vec::new();
    }
    let Some(root) = sessions_root() else {
        return Vec::new();
    };
    let mut hits = Vec::new();
    for dir in session_dirs(&root.join(project_id)) {
        let wire = wire_of(&dir);
        let session_id = dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        for item in read_session(&wire).unwrap_or_default() {
            if hits.len() >= SEARCH_MAX_HITS {
                return hits;
            }
            let haystack = item
                .text
                .clone()
                .or_else(|| item.tool_input_summary.clone())
                .unwrap_or_default();
            if haystack.to_lowercase().contains(&needle) {
                hits.push(SessionSearchHit {
                    session_id: session_id.clone(),
                    file_path: wire.to_string_lossy().into_owned(),
                    uuid: item.uuid.clone(),
                    timestamp: item.timestamp.clone(),
                    kind: item.kind.clone(),
                    preview: snippet_around(&haystack, &needle, SUMMARY_MAX),
                });
            }
        }
    }
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    const WIRE_TEXT: &str = concat!(
        r#"{"type":"metadata","protocol_version":"1.5","created_at":1793532514181}"#,
        "\n",
        r#"{"type":"context.append_message","agentId":"main","message":{"role":"user","content":[{"type":"text","text":"<hook_result hook_event=\"UserPromptSubmit\">ctx</hook_result>"},{"type":"text","text":"Сделай файл"}]},"time":1793532514600}"#,
        "\n",
        r#"{"type":"context.append_loop_event","event":{"type":"content.part","uuid":"u1","part":{"type":"think","think":"думаю"}},"time":1793532580000}"#,
        "\n",
        r#"{"type":"context.append_loop_event","event":{"type":"content.part","uuid":"u2","part":{"type":"text","text":"Готово"}},"time":1793532580027}"#,
        "\n",
        r#"{"type":"context.append_loop_event","event":{"type":"tool.call","uuid":"u3","toolCallId":"c1","name":"Write","args":{"path":"out.txt","content":"done"}},"time":1793531073059}"#,
        "\n",
        r#"{"type":"context.append_loop_event","event":{"type":"tool.result","parentUuid":"u3","toolCallId":"c1","result":{"output":"Wrote 4 bytes"}},"time":1793531073290}"#,
        "\n",
        r#"{"type":"turn.ended","agentId":"main","turnId":0,"reason":"completed","durationMs":65607}"#,
        "\n{broken\n",
        r#"{"type":"context.append_message","message":{"role":"user","content":[{"type":"text","text":"<system-reminder>x</system-reminder>"}]}}"#,
        "\n",
    );

    #[test]
    fn wire_records_become_display_items() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(WIRE);
        fs::write(&path, WIRE_TEXT).unwrap();
        let items = read_session(&path).unwrap();
        let kinds: Vec<&str> = items.iter().map(|i| i.kind.as_str()).collect();
        assert_eq!(
            kinds,
            [
                "user_text",
                "thinking",
                "assistant_text",
                "tool_use",
                "tool_result"
            ]
        );
        assert_eq!(items[0].text.as_deref(), Some("Сделай файл"));
        assert_eq!(items[2].text.as_deref(), Some("Готово"));
        assert_eq!(items[3].tool_name.as_deref(), Some("Write"));
        assert_eq!(items[4].text.as_deref(), Some("Wrote 4 bytes"));
        assert!(items[0]
            .timestamp
            .as_deref()
            .is_some_and(|t| t.starts_with("2026-")));
    }

    #[test]
    fn session_meta_reads_state_and_wire() {
        let dir = tempfile::tempdir().unwrap();
        let session = dir
            .path()
            .join("session_00000000-0000-0000-0000-000000000001");
        fs::create_dir_all(session.join("agents").join("main")).unwrap();
        fs::write(wire_of(&session), WIRE_TEXT).unwrap();
        fs::write(
            session.join("state.json"),
            r#"{"title":"Файл","isCustomTitle":false,"workDir":"C:/P/Game","createdAt":"2026-10-01T09:35:03.113Z","updatedAt":1793532580027}"#,
        )
        .unwrap();
        let meta = session_meta(&session).unwrap();
        assert_eq!(
            meta.session_id,
            "session_00000000-0000-0000-0000-000000000001"
        );
        assert_eq!(meta.ai_title.as_deref(), Some("Файл"));
        assert_eq!(meta.custom_title, None);
        assert_eq!(meta.cwd.as_deref(), Some(r"C:\P\Game"));
        assert_eq!(meta.first_prompt.as_deref(), Some("Сделай файл"));
        assert_eq!(meta.first_reply.as_deref(), Some("Готово"));
        assert_eq!(
            meta.first_event_at.as_deref(),
            Some("2026-10-01T09:35:03.113Z")
        );
        assert!(meta.last_event_at.is_some_and(|t| t.starts_with("2026-")));
        assert_eq!(meta.message_count, 4);
        assert_eq!(meta.duration_ms, 65607);
    }

    #[test]
    fn project_ids_are_plain_folder_names() {
        assert!(is_project_id("wd_breezee_3f11fc837cbb"));
        assert!(is_project_id("wm_0a1b2c3d-0000-0000-0000-000000000000"));
        assert!(!is_project_id("../x"));
        assert!(!is_project_id("wd_..\\x"));
        assert!(!is_project_id("C--Users-me"));
    }
}
