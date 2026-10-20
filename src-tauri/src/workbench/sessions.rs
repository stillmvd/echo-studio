use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::child_command;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEntry {
    pub id: Option<String>,
    pub pid: Option<u32>,
    pub cwd: Option<String>,
    pub kind: Option<String>,
    pub session_id: Option<String>,
    pub name: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookState {
    pub session_id: Option<String>,
    pub claude_pid: Option<u32>,
    pub project_dir: Option<String>,
    pub state: Option<String>,
    pub phase: Option<String>,
    pub tool: Option<String>,
    pub since: Option<u64>,
    pub transcript: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Waiting,
    Error,
    Working,
    Done,
    Idle,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Shell,
    External,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSession {
    pub session_id: String,
    pub short_id: Option<String>,
    pub kind: Kind,
    pub cwd: Option<String>,
    pub name: Option<String>,
    pub status: Status,
    pub phase: Option<String>,
    pub tool: Option<String>,
    pub since: Option<u64>,
    pub pid: Option<u32>,
    pub transcript: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Started {
    pub session_id: String,
    pub short_id: String,
}

pub const UNTRUSTED: &str = "untrusted";

pub fn claude_exe() -> PathBuf {
    let in_path = std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join("claude.exe"))
            .find(|p| p.is_file())
    });
    in_path
        .or_else(|| {
            dirs::home_dir()
                .map(|h| h.join(".local").join("bin").join("claude.exe"))
                .filter(|p| p.is_file())
        })
        .unwrap_or_else(|| PathBuf::from("claude"))
}

pub fn hooks_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("state").join("sessions"))
}

pub fn is_short_id(id: &str) -> bool {
    id.len() == 8
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn is_session_id(id: &str) -> bool {
    let groups: Vec<&str> = id.split('-').collect();
    groups.len() == 5
        && groups
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(g, n)| g.len() == n && g.bytes().all(|b| b.is_ascii_hexdigit()))
}

pub fn parse_agents(text: &str) -> Vec<AgentEntry> {
    serde_json::from_str::<Vec<Value>>(text)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect()
}

fn claude(args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd = child_command(&claude_exe().to_string_lossy());
    cmd.args(args).stdin(Stdio::null());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let out = cmd
        .output()
        .map_err(|e| format!("claude {}: {e}", args.join(" ")))?;
    let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&out.stderr));
    if out.status.success() {
        Ok(text)
    } else {
        Err(text.trim().to_string())
    }
}

pub fn run_agents() -> Result<Vec<AgentEntry>, String> {
    claude(&["agents", "--json"], None).map(|t| parse_agents(&t))
}

pub fn read_hooks(dir: &Path) -> HashMap<String, HookState> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return HashMap::new();
    };
    entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .filter_map(|p| std::fs::read_to_string(p).ok())
        .filter_map(|t| serde_json::from_str::<HookState>(&t).ok())
        .filter_map(|h| Some((h.session_id.clone()?, h)))
        .collect()
}

fn status_of(agent: &AgentEntry, hook: Option<&HookState>) -> Status {
    match agent.status.as_deref() {
        Some("waiting") => Status::Waiting,
        Some("busy") => Status::Working,
        _ => match hook.and_then(|h| h.state.as_deref()) {
            Some("error") => Status::Error,
            Some("done") => Status::Done,
            _ => Status::Idle,
        },
    }
}

pub fn is_live(agent: &AgentEntry) -> bool {
    agent.pid.is_some() || agent.status.is_some()
}

pub fn merge(agents: &[AgentEntry], hooks: &HashMap<String, HookState>) -> Vec<ClaudeSession> {
    agents
        .iter()
        .filter(|a| is_live(a))
        .filter_map(|a| {
            let session_id = a.session_id.clone()?;
            let hook = hooks.get(&session_id);
            Some(ClaudeSession {
                short_id: a.id.clone().filter(|id| is_short_id(id)),
                kind: if a.kind.as_deref() == Some("background") {
                    Kind::Shell
                } else {
                    Kind::External
                },
                cwd: a
                    .cwd
                    .clone()
                    .or_else(|| hook.and_then(|h| h.project_dir.clone())),
                name: a.name.clone(),
                status: status_of(a, hook),
                phase: hook.and_then(|h| h.phase.clone()),
                tool: hook.and_then(|h| h.tool.clone()),
                since: hook.and_then(|h| h.since),
                pid: a.pid.or_else(|| hook.and_then(|h| h.claude_pid)),
                transcript: hook.and_then(|h| h.transcript.clone()),
                session_id,
            })
        })
        .collect()
}

pub fn list() -> Result<Vec<ClaudeSession>, String> {
    let agents = run_agents()?;
    let hooks = hooks_dir().map(|d| read_hooks(&d)).unwrap_or_default();
    Ok(merge(&agents, &hooks))
}

pub fn parse_backgrounded(text: &str) -> Option<String> {
    text.lines()
        .filter(|l| l.contains("backgrounded"))
        .find_map(|l| l.split('·').nth(1)?.split_whitespace().next())
        .filter(|id| is_short_id(id))
        .map(String::from)
}

pub fn start(project: &Path, resume: Option<&str>) -> Result<Started, String> {
    if let Some(id) = resume {
        if !is_session_id(id) {
            return Err(format!("invalid session id: {id}"));
        }
        let live = run_agents()?
            .into_iter()
            .find(|a| is_live(a) && a.session_id.as_deref() == Some(id));
        if let Some(agent) = live {
            return match agent.id.filter(|s| is_short_id(s)) {
                Some(short_id) => Ok(Started {
                    session_id: id.to_string(),
                    short_id,
                }),
                None => Err("the conversation is open outside the workbench".into()),
            };
        }
    }
    let mut args = vec!["--bg"];
    if let Some(id) = resume {
        args.extend(["--resume", id]);
    }
    let text = match claude(&args, Some(project)) {
        Ok(t) => t,
        Err(e) if e.contains("Workspace not trusted") => return Err(UNTRUSTED.into()),
        Err(e) => return Err(e),
    };
    if text.contains("Workspace not trusted") {
        return Err(UNTRUSTED.into());
    }
    let short_id = parse_backgrounded(&text)
        .ok_or_else(|| format!("unexpected claude --bg output: {}", text.trim()))?;
    for _ in 0..10 {
        let found = run_agents()?
            .into_iter()
            .find(|a| a.id.as_deref() == Some(&short_id))
            .and_then(|a| a.session_id);
        if let Some(session_id) = found {
            return Ok(Started {
                session_id,
                short_id,
            });
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
    Err(format!(
        "session {short_id} did not appear in claude agents"
    ))
}

pub fn stop(short_id: &str) -> Result<(), String> {
    if !is_short_id(short_id) {
        return Err(format!("invalid short id: {short_id}"));
    }
    claude(&["stop", short_id], None).map(|_| ())
}

pub fn forget(short_id: &str) -> Result<(), String> {
    if !is_short_id(short_id) {
        return Err(format!("invalid short id: {short_id}"));
    }
    claude(&["rm", short_id], None).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    const AGENTS: &str = r#"[
      {"id":"addf9966","cwd":"C:\\P\\Waypoint","kind":"background","startedAt":1,"sessionId":"addf9966-22f5-4925-9aca-f5f114f6e4b6","name":"dead","state":"blocked"},
      {"pid":23632,"cwd":"C:\\P\\AM","kind":"interactive","sessionId":"8e5e1113-effe-47a2-832a-a2c5bf110aaf","name":"am","status":"busy"},
      {"pid":39504,"id":"b4eda7ff","cwd":"C:\\P\\Echo","kind":"background","sessionId":"b4eda7ff-5f54-42a6-bd10-eada7ec3c0f4","name":"probe","status":"idle","state":"blocked"},
      {"pid":1,"id":"c0ffee00","kind":"background","sessionId":"c0ffee00-0000-0000-0000-000000000000","status":"waiting","state":"blocked"},
      "garbage",
      {"pid":2,"kind":"interactive","name":"no session id"}
    ]"#;

    fn hook(id: &str, state: &str) -> (String, HookState) {
        (
            id.into(),
            HookState {
                session_id: Some(id.into()),
                state: Some(state.into()),
                phase: Some("tool".into()),
                tool: Some("Bash".into()),
                since: Some(5),
                project_dir: Some("C:\\P\\X".into()),
                ..Default::default()
            },
        )
    }

    #[test]
    fn merges_agents_and_hooks() {
        let agents = parse_agents(AGENTS);
        assert_eq!(agents.len(), 5);
        let hooks: HashMap<_, _> = [
            hook("b4eda7ff-5f54-42a6-bd10-eada7ec3c0f4", "done"),
            hook("8e5e1113-effe-47a2-832a-a2c5bf110aaf", "done"),
        ]
        .into();
        let list = merge(&agents, &hooks);
        assert_eq!(
            list.len(),
            3,
            "dead background record without pid and status is dropped"
        );

        let am = &list[0];
        assert_eq!(am.kind, Kind::External);
        assert_eq!(am.status, Status::Working);
        assert_eq!(am.short_id, None);

        let probe = &list[1];
        assert_eq!(probe.kind, Kind::Shell);
        assert_eq!(probe.status, Status::Done, "idle + hook done");
        assert_eq!(probe.short_id.as_deref(), Some("b4eda7ff"));
        assert_eq!(probe.tool.as_deref(), Some("Bash"));

        let waiting = &list[2];
        assert_eq!(waiting.status, Status::Waiting, "state=blocked is ignored");
        assert_eq!(waiting.cwd, None);
    }

    #[test]
    fn fresh_session_is_idle_not_waiting() {
        let agents = parse_agents(
            r#"[{"pid":9,"id":"aaaaaaaa","kind":"background","sessionId":"aaaaaaaa-0000-0000-0000-000000000000","status":"idle","state":"blocked"}]"#,
        );
        assert_eq!(merge(&agents, &HashMap::new())[0].status, Status::Idle);
    }

    #[test]
    fn hook_error_wins_when_idle() {
        let agents = parse_agents(
            r#"[{"pid":9,"id":"aaaaaaaa","kind":"background","sessionId":"aaaaaaaa-0000-0000-0000-000000000000","status":"idle"}]"#,
        );
        let hooks: HashMap<_, _> = [hook("aaaaaaaa-0000-0000-0000-000000000000", "error")].into();
        assert_eq!(merge(&agents, &hooks)[0].status, Status::Error);
    }

    #[test]
    fn parses_backgrounded_output() {
        let out =
            "backgrounded · b4eda7ff · echo-probe\n  claude agents             list sessions\n";
        assert_eq!(parse_backgrounded(out).as_deref(), Some("b4eda7ff"));
        assert_eq!(
            parse_backgrounded("backgrounded · 503b313c (idle — send a prompt to start)\n")
                .as_deref(),
            Some("503b313c")
        );
        assert_eq!(
            parse_backgrounded("warning: x\nbackgrounded · nothex!! · y"),
            None
        );
        assert_eq!(parse_backgrounded("Workspace not trusted."), None);
    }

    #[test]
    fn validates_ids() {
        assert!(is_short_id("b4eda7ff"));
        assert!(!is_short_id("B4EDA7FF"));
        assert!(!is_short_id("b4eda7f"));
        assert!(!is_short_id("b4eda7f; rm"));
        assert!(is_session_id("b4eda7ff-5f54-42a6-bd10-eada7ec3c0f4"));
        assert!(!is_session_id("b4eda7ff-5f54-42a6-bd10"));
        assert!(!is_session_id("b4eda7ff-5f54-42a6-bd10-eada7ec3c0fz"));
    }

    #[test]
    fn reads_hook_files_skipping_tmp_and_broken() {
        let tmp = tempfile::tempdir().unwrap();
        let d = tmp.path();
        std::fs::write(d.join("a.json"), r#"{"sessionId":"a","state":"working"}"#).unwrap();
        std::fs::write(d.join("a.json.123.tmp"), r#"{"sessionId":"t"}"#).unwrap();
        std::fs::write(d.join("b.json"), "{broken").unwrap();
        let hooks = read_hooks(d);
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks["a"].state.as_deref(), Some("working"));
    }
}
