use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use super::{child_command, projects, projects_root};

const EXITED_WINDOW_MS: u64 = 3_600_000;
const CLAUDE_TIMEOUT: Duration = Duration::from_secs(20);
const RESTART_WAIT: Duration = Duration::from_secs(15);
const START_TIMEOUT: Duration = Duration::from_secs(60);
const PIPE_GRACE: Duration = Duration::from_millis(500);
const DAEMON_LOG_TAIL: u64 = 256 * 1024;

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
    pub state: Option<String>,
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
    pub updated_at: Option<u64>,
    pub task: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Waiting,
    Error,
    Working,
    Done,
    Idle,
    Exited,
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
    pub exited_at: Option<u64>,
    pub shells: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Started {
    pub session_id: Option<String>,
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

pub fn parse_agents(text: &str) -> Result<Vec<AgentEntry>, String> {
    let list = serde_json::from_str::<Vec<Value>>(text.trim())
        .map_err(|e| format!("claude agents --json: {e}"))?;
    Ok(list
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect())
}

struct Output {
    stdout: String,
    stderr: String,
}

struct Pipe {
    buf: Arc<Mutex<Vec<u8>>>,
    eof: mpsc::Receiver<()>,
}

impl Pipe {
    fn read(pipe: Option<impl Read + Send + 'static>) -> Self {
        let buf = Arc::new(Mutex::new(Vec::new()));
        let (tx, eof) = mpsc::channel();
        if let Some(mut pipe) = pipe {
            let buf = buf.clone();
            std::thread::spawn(move || {
                let mut chunk = [0u8; 8192];
                while let Ok(n) = pipe.read(&mut chunk) {
                    if n == 0 {
                        break;
                    }
                    if let Ok(mut b) = buf.lock() {
                        b.extend_from_slice(&chunk[..n]);
                    }
                }
                let _ = tx.send(());
            });
        }
        Pipe { buf, eof }
    }

    fn text(self) -> String {
        let _ = self.eof.recv_timeout(PIPE_GRACE);
        self.buf
            .lock()
            .map(|b| String::from_utf8_lossy(&b).into_owned())
            .unwrap_or_default()
    }
}

fn claude(args: &[&str], cwd: Option<&Path>) -> Result<Output, String> {
    let timeout = if args.contains(&"--bg") {
        START_TIMEOUT
    } else {
        CLAUDE_TIMEOUT
    };
    let what = format!("claude {}", args.join(" "));
    let mut cmd = child_command(&claude_exe().to_string_lossy());
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let mut child = cmd.spawn().map_err(|e| format!("{what}: {e}"))?;
    let stdout = Pipe::read(child.stdout.take());
    let stderr = Pipe::read(child.stderr.take());
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait().map_err(|e| format!("{what}: {e}"))? {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{what}: no answer in {}s", timeout.as_secs()));
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    };
    let out = Output {
        stdout: stdout.text(),
        stderr: stderr.text(),
    };
    if status.success() {
        Ok(out)
    } else {
        let msg = format!("{}\n{}", out.stdout.trim(), out.stderr.trim());
        Err(format!("{what}: {}", msg.trim()))
    }
}

type AgentsCache = Mutex<Option<(Instant, Vec<AgentEntry>)>>;

static AGENTS: AgentsCache = Mutex::new(None);

pub const AGENTS_FRESH: Duration = Duration::from_secs(3);

fn cached_agents(
    cache: &AgentsCache,
    max_age: Duration,
    run: impl FnOnce() -> Result<Vec<AgentEntry>, String>,
) -> Result<Vec<AgentEntry>, String> {
    let mut slot = cache.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((at, list)) = slot.as_ref() {
        if !max_age.is_zero() && at.elapsed() < max_age {
            return Ok(list.clone());
        }
    }
    let list = run()?;
    *slot = Some((Instant::now(), list.clone()));
    Ok(list)
}

fn clear_agents(cache: &AgentsCache) {
    *cache.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

pub fn invalidate_agents() {
    clear_agents(&AGENTS);
}

pub fn run_agents_cached(max_age: Duration) -> Result<Vec<AgentEntry>, String> {
    cached_agents(&AGENTS, max_age, || {
        parse_agents(&claude(&["agents", "--json"], None)?.stdout)
    })
}

pub fn run_agents() -> Result<Vec<AgentEntry>, String> {
    run_agents_cached(Duration::ZERO)
}

fn shell_agent(short_id: &str, max_age: Duration) -> Result<Option<AgentEntry>, String> {
    if !is_short_id(short_id) {
        return Err(format!("invalid short id: {short_id}"));
    }
    let Some(agent) = run_agents_cached(max_age)?
        .into_iter()
        .find(|a| a.id.as_deref() == Some(short_id))
    else {
        return Ok(None);
    };
    if agent.kind.as_deref() != Some("background") {
        return Err(format!("session {short_id} is not a background session"));
    }
    let root = projects_root().ok_or("cannot resolve Projects root")?;
    let tree = projects::scan(&root);
    let inside = agent
        .cwd
        .as_deref()
        .is_some_and(|cwd| projects::place_for(&tree, cwd).is_some());
    if !inside {
        return Err(format!("session {short_id} is outside known projects"));
    }
    Ok(Some(agent))
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

fn turn_over(agent: &AgentEntry) -> bool {
    agent.state.as_deref().is_some_and(|s| s != "working")
}

fn status_of(agent: &AgentEntry, hook: Option<&HookState>) -> Status {
    match agent.status.as_deref() {
        Some("waiting") => Status::Waiting,
        Some("busy") if !turn_over(agent) => Status::Working,
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
                exited_at: None,
                shells: a.status.as_deref() == Some("busy") && turn_over(a),
                session_id,
            })
        })
        .collect()
}

pub fn exited_external(
    hooks: &HashMap<String, HookState>,
    agents: &[AgentEntry],
    tree: &projects::ProjectTree,
    now: u64,
    alive: impl Fn(u32) -> bool,
) -> Vec<ClaudeSession> {
    let mut list: Vec<ClaudeSession> = hooks
        .values()
        .filter(|h| {
            h.updated_at
                .is_some_and(|t| t.saturating_add(EXITED_WINDOW_MS) >= now)
        })
        .filter(|h| {
            !agents
                .iter()
                .any(|a| a.session_id.is_some() && a.session_id == h.session_id)
        })
        .filter(|h| h.claude_pid.is_none_or(|pid| !alive(pid)))
        .filter(|h| {
            h.project_dir
                .as_deref()
                .is_some_and(|d| projects::place_for(tree, d).is_some())
        })
        .filter_map(|h| {
            let session_id = h.session_id.clone().filter(|id| is_session_id(id))?;
            Some(ClaudeSession {
                session_id,
                short_id: None,
                kind: Kind::External,
                cwd: h.project_dir.clone(),
                name: h.task.clone(),
                status: Status::Exited,
                phase: None,
                tool: None,
                since: h.updated_at,
                pid: None,
                transcript: h.transcript.clone(),
                exited_at: h.updated_at,
                shells: false,
            })
        })
        .collect();
    list.sort_by_key(|s| std::cmp::Reverse(s.exited_at));
    list
}

fn alive_claudes(pids: &[u32]) -> Vec<u32> {
    if pids.is_empty() {
        return Vec::new();
    }
    let list: Vec<Pid> = pids.iter().map(|p| Pid::from_u32(*p)).collect();
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&list),
        true,
        ProcessRefreshKind::nothing(),
    );
    pids.iter()
        .copied()
        .filter(|pid| {
            sys.process(Pid::from_u32(*pid))
                .is_some_and(|p| p.name().eq_ignore_ascii_case("claude.exe"))
        })
        .collect()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn spare_ids(log: &str) -> HashSet<String> {
    log.lines()
        .filter_map(|line| {
            let (id, rest) = line.split_once("bg spawned ")?.1.split_once(' ')?;
            (rest.trim() == "(spare)" && is_short_id(id)).then(|| id.to_owned())
        })
        .collect()
}

fn daemon_spares() -> HashSet<String> {
    let Some(path) = dirs::home_dir().map(|h| h.join(".claude").join("daemon.log")) else {
        return HashSet::new();
    };
    let Ok(mut file) = std::fs::File::open(path) else {
        return HashSet::new();
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut buf = Vec::new();
    if file
        .seek(SeekFrom::Start(len.saturating_sub(DAEMON_LOG_TAIL)))
        .and_then(|_| file.read_to_end(&mut buf))
        .is_err()
    {
        return HashSet::new();
    }
    spare_ids(&String::from_utf8_lossy(&buf))
}

fn has_transcript(path: Option<&str>) -> bool {
    path.is_some_and(|p| Path::new(p).is_file())
}

pub fn drop_spares(list: &mut Vec<ClaudeSession>, spares: &HashSet<String>) {
    list.retain(|s| {
        !s.short_id.as_ref().is_some_and(|id| spares.contains(id))
            || has_transcript(s.transcript.as_deref())
    });
}

pub fn list() -> Result<Vec<ClaudeSession>, String> {
    let agents = run_agents_cached(AGENTS_FRESH)?;
    let hooks = hooks_dir().map(|d| read_hooks(&d)).unwrap_or_default();
    let mut list = merge(&agents, &hooks);
    drop_spares(&mut list, &daemon_spares());
    let now = now_ms();
    let candidates: HashMap<String, HookState> = hooks
        .into_iter()
        .filter(|(_, h)| {
            h.updated_at
                .is_some_and(|t| t.saturating_add(EXITED_WINDOW_MS) >= now)
                && !agents.iter().any(|a| a.session_id == h.session_id)
                && has_transcript(h.transcript.as_deref())
        })
        .collect();
    if let (false, Some(root)) = (candidates.is_empty(), projects_root()) {
        let tree = projects::scan(&root);
        let pids: Vec<u32> = candidates.values().filter_map(|h| h.claude_pid).collect();
        let alive = alive_claudes(&pids);
        list.extend(exited_external(&candidates, &agents, &tree, now, |pid| {
            alive.contains(&pid)
        }));
    }
    Ok(list)
}

pub fn session_pid(session_id: &str) -> Result<u32, String> {
    if !is_session_id(session_id) {
        return Err(format!("invalid session id: {session_id}"));
    }
    let agents = run_agents_cached(AGENTS_FRESH);
    let from_agents = agents.as_ref().ok().and_then(|list| {
        list.iter()
            .find(|a| a.session_id.as_deref() == Some(session_id))
            .and_then(|a| a.pid)
    });
    let pid = from_agents
        .or_else(|| hook_pid(session_id))
        .ok_or_else(|| match &agents {
            Err(e) => format!("no claude pid for session {session_id}: {e}"),
            Ok(_) => format!("no claude pid for session {session_id}"),
        })?;
    ensure_claude(pid)
}

fn hook_pid(session_id: &str) -> Option<u32> {
    let file = hooks_dir()?.join(format!("{session_id}.json"));
    std::fs::read_to_string(file)
        .ok()
        .and_then(|t| serde_json::from_str::<HookState>(&t).ok())
        .filter(|h| h.session_id.as_deref() == Some(session_id))
        .and_then(|h| h.claude_pid)
}

fn ensure_claude(pid: u32) -> Result<u32, String> {
    if pid != 0 && alive_claudes(&[pid]) == [pid] {
        Ok(pid)
    } else {
        Err("session process is not running".to_owned())
    }
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
                    session_id: Some(id.to_string()),
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
        Ok(out) => format!("{}\n{}", out.stdout, out.stderr),
        Err(e) if e.contains("Workspace not trusted") => return Err(UNTRUSTED.into()),
        Err(e) => return Err(e),
    };
    if text.contains("Workspace not trusted") {
        return Err(UNTRUSTED.into());
    }
    let short_id = parse_backgrounded(&text)
        .ok_or_else(|| format!("unexpected claude --bg output: {}", text.trim()))?;
    invalidate_agents();
    for _ in 0..10 {
        let found = run_agents()
            .ok()
            .and_then(|list| {
                list.into_iter()
                    .find(|a| a.id.as_deref() == Some(&short_id))
            })
            .and_then(|a| a.session_id);
        if found.is_some() {
            return Ok(Started {
                session_id: found,
                short_id,
            });
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    Ok(Started {
        session_id: None,
        short_id,
    })
}

pub fn stop(short_id: &str) -> Result<(), String> {
    match shell_agent(short_id, Duration::ZERO)? {
        None => Err(format!("no session {short_id}")),
        Some(agent) if !is_live(&agent) => Ok(()),
        Some(_) => claude(&["stop", short_id], None).map(|_| invalidate_agents()),
    }
}

pub fn restart(project: &Path, session_id: &str, short_id: &str) -> Result<Started, String> {
    let pid = shell_agent(short_id, Duration::ZERO)?
        .filter(|a| a.session_id.as_deref() == Some(session_id))
        .ok_or_else(|| format!("no session {short_id}"))?
        .pid;
    stop(short_id)?;
    let deadline = Instant::now() + RESTART_WAIT;
    loop {
        let listed = run_agents()?
            .iter()
            .any(|a| is_live(a) && a.session_id.as_deref() == Some(session_id));
        let running = pid.is_some_and(|p| !alive_claudes(&[p]).is_empty());
        if !listed && !running {
            break;
        }
        if Instant::now() >= deadline {
            return Err(format!("session {short_id} did not stop in time"));
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    start(project, Some(session_id))
}

pub fn forget(short_id: &str) -> Result<(), String> {
    match shell_agent(short_id, Duration::ZERO)? {
        None => Ok(()),
        Some(agent) if is_live(&agent) => Err(format!("session {short_id} is still running")),
        Some(_) => claude(&["rm", short_id], None).map(|_| invalidate_agents()),
    }
}

pub fn ensure_attachable(short_id: &str) -> Result<(), String> {
    shell_agent(short_id, AGENTS_FRESH)?
        .map(|_| ())
        .ok_or_else(|| format!("no session {short_id}"))
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
    fn spares_come_from_daemon_log_and_hide_until_they_get_a_transcript() {
        let log = "[2026-10-21T10:22:08.206Z] [bg] bg spawned c99985cc (spare)\n\
                   [2026-10-21T10:03:10.487Z] [bg] bg spawned 72940b83 (shell)\n\
                   [2026-10-21T11:23:08.031Z] [bg] bg retire c99985cc: stale-spare, idle 61m\n\
                   [bg] bg spawned XYZ (spare)\n";
        let spares = spare_ids(log);
        assert_eq!(spares, HashSet::from(["c99985cc".to_owned()]));

        let tmp = tempfile::tempdir().unwrap();
        let written = tmp.path().join("t.jsonl");
        std::fs::write(&written, "{}").unwrap();
        let session = |short: &str, transcript: Option<&Path>| ClaudeSession {
            session_id: format!("{short}-0000-0000-0000-000000000000"),
            short_id: Some(short.into()),
            kind: Kind::Shell,
            cwd: None,
            name: None,
            status: Status::Idle,
            phase: None,
            tool: None,
            since: None,
            pid: Some(1),
            transcript: transcript.map(|p| p.to_string_lossy().into_owned()),
            exited_at: None,
            shells: false,
        };
        let mut list = vec![
            session("c99985cc", Some(&tmp.path().join("missing.jsonl"))),
            session("72940b83", None),
        ];
        drop_spares(&mut list, &spares);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].short_id.as_deref(), Some("72940b83"));

        let mut used = vec![session("c99985cc", Some(&written))];
        drop_spares(&mut used, &spares);
        assert_eq!(used.len(), 1);
    }

    #[test]
    fn merges_agents_and_hooks() {
        let agents = parse_agents(AGENTS).unwrap();
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
    fn broken_agents_output_is_an_error_not_an_empty_list() {
        assert!(parse_agents("").is_err());
        assert!(parse_agents("warning: update available\n[]").is_err());
        assert!(parse_agents("[]\n").unwrap().is_empty());
    }

    #[test]
    fn fresh_session_is_idle_not_waiting() {
        let agents = parse_agents(
            r#"[{"pid":9,"id":"aaaaaaaa","kind":"background","sessionId":"aaaaaaaa-0000-0000-0000-000000000000","status":"idle","state":"blocked"}]"#,
        )
        .unwrap();
        assert_eq!(merge(&agents, &HashMap::new())[0].status, Status::Idle);
    }

    #[test]
    fn finished_turn_with_background_shell_is_done() {
        let agents = parse_agents(
            r#"[{"pid":9,"id":"aaaaaaaa","kind":"background","sessionId":"aaaaaaaa-0000-0000-0000-000000000000","status":"busy","state":"done"},
                {"pid":8,"id":"bbbbbbbb","kind":"background","sessionId":"bbbbbbbb-0000-0000-0000-000000000000","status":"busy","state":"working"},
                {"pid":7,"id":"cccccccc","kind":"background","sessionId":"cccccccc-0000-0000-0000-000000000000","status":"busy","state":"blocked"}]"#,
        )
        .unwrap();
        let hooks: HashMap<_, _> = [hook("aaaaaaaa-0000-0000-0000-000000000000", "done")].into();
        let list = merge(&agents, &hooks);
        assert_eq!(list[0].status, Status::Done);
        assert!(list[0].shells);
        assert_eq!(list[1].status, Status::Working);
        assert!(!list[1].shells);
        assert_ne!(list[2].status, Status::Working);
        assert!(list[2].shells);
    }

    #[test]
    fn hook_error_wins_when_idle() {
        let agents = parse_agents(
            r#"[{"pid":9,"id":"aaaaaaaa","kind":"background","sessionId":"aaaaaaaa-0000-0000-0000-000000000000","status":"idle"}]"#,
        )
        .unwrap();
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

    fn tree() -> projects::ProjectTree {
        projects::ProjectTree {
            groups: Vec::new(),
            roots: vec![projects::Project {
                path: r"C:\P\Echo".into(),
                name: "Echo".into(),
                group: None,
                icon: None,
                dev: None,
                mcp: None,
                has_claude_md: false,
                folder: false,
            }],
            folders: Vec::new(),
            root: r"C:\P".into(),
        }
    }

    fn ended(id: &str, pid: u32, dir: &str, updated_at: u64) -> (String, HookState) {
        (
            id.into(),
            HookState {
                session_id: Some(id.into()),
                claude_pid: Some(pid),
                project_dir: Some(dir.into()),
                state: Some("done".into()),
                updated_at: Some(updated_at),
                task: Some(format!("task {pid}")),
                ..Default::default()
            },
        )
    }

    #[test]
    fn exited_external_from_fresh_hook_files() {
        const NOW: u64 = 10_000_000;
        let fresh = "11111111-0000-4000-8000-000000000000";
        let hooks: HashMap<_, _> = [
            ended(fresh, 1, "C:/P/Echo/.claude/worktrees/x", NOW - 60_000),
            ended(
                "22222222-0000-4000-8000-000000000000",
                2,
                r"C:\P\Echo",
                NOW - EXITED_WINDOW_MS - 1,
            ),
            ended("33333333-0000-4000-8000-000000000000", 3, r"C:\P\Echo", NOW),
            ended(
                "44444444-0000-4000-8000-000000000000",
                4,
                r"D:\elsewhere",
                NOW,
            ),
            ended("55555555-0000-4000-8000-000000000000", 5, r"C:\P\Echo", NOW),
            ended("not-a-uuid", 6, r"C:\P\Echo", NOW),
        ]
        .into();
        let agents = parse_agents(
            r#"[{"id":"55555555","kind":"background","sessionId":"55555555-0000-4000-8000-000000000000"}]"#,
        )
        .unwrap();
        let list = exited_external(&hooks, &agents, &tree(), NOW, |pid| pid == 3);
        assert_eq!(list.len(), 1, "{list:?}");
        let s = &list[0];
        assert_eq!(s.session_id, fresh);
        assert_eq!(s.kind, Kind::External);
        assert_eq!(s.status, Status::Exited);
        assert_eq!(s.exited_at, Some(NOW - 60_000));
        assert_eq!(s.short_id, None);
        assert_eq!(s.pid, None);
        assert_eq!(s.cwd.as_deref(), Some("C:/P/Echo/.claude/worktrees/x"));
        assert_eq!(s.name.as_deref(), Some("task 1"));
    }

    #[test]
    fn exited_session_serializes_as_contract() {
        let hooks: HashMap<_, _> = [ended(
            "11111111-0000-4000-8000-000000000000",
            1,
            r"C:\P\Echo",
            5,
        )]
        .into();
        let list = exited_external(&hooks, &[], &tree(), 5, |_| false);
        let v = serde_json::to_value(&list[0]).unwrap();
        assert_eq!(v["status"], "exited");
        assert_eq!(v["exitedAt"], 5);
        assert_eq!(v["kind"], "external");
    }

    #[test]
    fn agents_cache_runs_once_while_fresh() {
        let cache: AgentsCache = Mutex::new(None);
        let runs = std::cell::Cell::new(0);
        let run = || {
            runs.set(runs.get() + 1);
            Ok(Vec::new())
        };
        let fresh = Duration::from_secs(60);
        cached_agents(&cache, fresh, run).unwrap();
        cached_agents(&cache, fresh, run).unwrap();
        assert_eq!(runs.get(), 1);
        cached_agents(&cache, Duration::ZERO, run).unwrap();
        assert_eq!(runs.get(), 2, "zero max age always runs");
        assert!(cached_agents(&cache, Duration::ZERO, || Err("boom".into())).is_err());
        cached_agents(&cache, fresh, run).unwrap();
        assert_eq!(runs.get(), 2, "a failed run keeps the last good list");
        clear_agents(&cache);
        cached_agents(&cache, fresh, run).unwrap();
        assert_eq!(runs.get(), 3, "an invalidated cache runs again");
    }

    #[test]
    fn only_a_running_claude_pid_is_accepted() {
        assert!(ensure_claude(0).is_err());
        assert!(ensure_claude(u32::MAX - 1).is_err());
        assert!(
            ensure_claude(std::process::id()).is_err(),
            "a live process that is not claude.exe"
        );
    }

    #[test]
    #[ignore]
    fn session_pid_live() {
        let id = std::env::var("SESSION_ID").unwrap();
        let pid = session_pid(&id).unwrap();
        assert!(pid > 0);
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
