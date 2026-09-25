use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

use serde_json::Value;

use super::models::{ConversationProject, SessionMeta};
use super::paths::{decode_cwd, display_name, projects_root};
use super::reader::jsonl_lines;

pub fn list_projects() -> Vec<ConversationProject> {
    let Some(root) = projects_root() else {
        return Vec::new();
    };
    if !root.exists() {
        return Vec::new();
    }

    let mut projects: Vec<ConversationProject> = Vec::new();

    let Ok(entries) = fs::read_dir(&root) else {
        return projects;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(folder_name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        let mut session_count = 0usize;
        let mut total_size = 0u64;
        let mut last_activity: Option<String> = None;
        let mut sample_cwd: Option<String> = None;

        if let Ok(files) = fs::read_dir(&path) {
            for f in files.flatten() {
                let fp = f.path();
                if fp.extension().and_then(|s| s.to_str()) != Some("jsonl") {
                    continue;
                }
                session_count += 1;
                if let Ok(meta) = f.metadata() {
                    total_size += meta.len();
                    if let Ok(modified) = meta.modified() {
                        let stamp = humantime::format_rfc3339(modified).to_string();
                        match &last_activity {
                            Some(prev) if prev >= &stamp => {}
                            _ => last_activity = Some(stamp),
                        }
                    }
                }
                if sample_cwd.is_none() {
                    if let Some(cwd) = read_cwd_from_first_line(&fp) {
                        sample_cwd = Some(cwd);
                    }
                }
            }
        }

        if session_count == 0 {
            continue;
        }

        let resolved_cwd = sample_cwd.unwrap_or_else(|| decode_cwd(folder_name));
        let display = display_name(&resolved_cwd);

        projects.push(ConversationProject {
            id: folder_name.to_string(),
            cwd: resolved_cwd,
            display_name: display,
            session_count,
            total_size,
            last_activity,
        });
    }

    projects.sort_by(|a, b| {
        b.last_activity
            .clone()
            .unwrap_or_default()
            .cmp(&a.last_activity.clone().unwrap_or_default())
    });
    projects
}

pub fn list_sessions(project_id: &str) -> Vec<SessionMeta> {
    let Some(root) = projects_root() else {
        return Vec::new();
    };
    let project_dir = root.join(project_id);
    if !project_dir.is_dir() {
        return Vec::new();
    }

    let mut sessions: Vec<SessionMeta> = Vec::new();
    let Ok(entries) = fs::read_dir(&project_dir) else {
        return sessions;
    };
    let titles = super::titles::load_titles();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
            continue;
        }
        if let Some(mut meta) = parse_session_meta(&path) {
            meta.user_title = titles.get(&meta.session_id).cloned();
            sessions.push(meta);
        }
    }
    sessions.sort_by(|a, b| {
        b.last_event_at
            .clone()
            .unwrap_or_default()
            .cmp(&a.last_event_at.clone().unwrap_or_default())
    });
    sessions
}

fn read_cwd_from_first_line(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    let _ = reader.read_line(&mut line).ok()?;
    let parsed: Value = serde_json::from_str(&line).ok()?;
    parsed.get("cwd").and_then(|v| v.as_str()).map(String::from)
}

pub fn parse_session_meta(path: &Path) -> Option<SessionMeta> {
    let metadata = fs::metadata(path).ok()?;
    let size = metadata.len();
    let file_path = path.to_string_lossy().to_string();

    let session_id = path.file_stem()?.to_string_lossy().to_string();

    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut message_count: u32 = 0;
    let mut duration_ms: i64 = 0;
    let mut first_event_at: Option<String> = None;
    let mut last_event_at: Option<String> = None;
    let mut git_branch: Option<String> = None;
    let mut cwd: Option<String> = None;
    let mut custom_title: Option<String> = None;
    let mut ai_title: Option<String> = None;

    for line in jsonl_lines(reader) {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(parsed) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let event_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");

        if matches!(event_type, "user" | "assistant") {
            message_count += 1;
        }

        if event_type == "custom-title" {
            if let Some(t) = parsed.get("customTitle").and_then(|v| v.as_str()) {
                if !t.is_empty() {
                    custom_title = Some(t.to_string());
                }
            }
        }
        if event_type == "ai-title" {
            if let Some(t) = parsed.get("aiTitle").and_then(|v| v.as_str()) {
                if !t.is_empty() {
                    ai_title = Some(t.to_string());
                }
            }
        }

        if event_type == "system"
            && parsed.get("subtype").and_then(|v| v.as_str()) == Some("turn_duration")
        {
            if let Some(d) = parsed.get("durationMs").and_then(|v| v.as_i64()) {
                duration_ms += d;
            }
        }

        if let Some(ts) = parsed.get("timestamp").and_then(|v| v.as_str()) {
            if first_event_at.is_none() {
                first_event_at = Some(ts.to_string());
            }
            last_event_at = Some(ts.to_string());
        }

        if cwd.is_none() {
            if let Some(c) = parsed.get("cwd").and_then(|v| v.as_str()) {
                cwd = Some(c.to_string());
            }
        }
        if git_branch.is_none() {
            if let Some(b) = parsed.get("gitBranch").and_then(|v| v.as_str()) {
                if !b.is_empty() {
                    git_branch = Some(b.to_string());
                }
            }
        }
    }

    Some(SessionMeta {
        session_id,
        file_path,
        size_bytes: size,
        message_count,
        first_event_at,
        last_event_at,
        duration_ms,
        git_branch,
        cwd,
        custom_title,
        ai_title,
        user_title: None,
    })
}
