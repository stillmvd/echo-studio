use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

use super::projects::{all_projects, is_within, ProjectTree};

const SHOWN: [&str; 5] = [
    "claude.exe",
    "node.exe",
    "bun.exe",
    "rust-analyzer.exe",
    "cargo.exe",
];
const CAPTURED: [&str; 11] = [
    "claude.exe",
    "node.exe",
    "bun.exe",
    "rust-analyzer.exe",
    "cargo.exe",
    "rustc.exe",
    "esbuild.exe",
    "bash.exe",
    "chrome.exe",
    "cmd.exe",
    "conhost.exe",
];
const PASSTHROUGH: [&str; 4] = ["cmd.exe", "conhost.exe", "bash.exe", "sh.exe"];
const INHERIT: [&str; 6] = [
    "cmd.exe",
    "conhost.exe",
    "bash.exe",
    "sh.exe",
    "esbuild.exe",
    "dart.exe",
];
const MAX_DEPTH: usize = 30;
const COMMAND_MAX: usize = 240;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Proc {
    pub pid: u32,
    #[serde(default)]
    pub ppid: u32,
    pub name: String,
    #[serde(default)]
    pub exe: Option<String>,
    #[serde(default)]
    pub cmd: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub start_time: u64,
    #[serde(default)]
    pub memory: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookSession {
    pub session_id: String,
    #[serde(default)]
    pub claude_pid: Option<u32>,
    #[serde(default)]
    pub project_dir: Option<String>,
    #[serde(default)]
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRef {
    #[serde(default)]
    pub pid: Option<u32>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevJob {
    pub project_path: String,
    pub pids: Vec<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub processes: Vec<Proc>,
    #[serde(default)]
    pub outside_parents: Vec<Proc>,
    #[serde(default)]
    pub hook_sessions: Vec<HookSession>,
    #[serde(default)]
    pub agents: Vec<AgentRef>,
    #[serde(default)]
    pub dev_jobs: Vec<DevJob>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectRef {
    pub path: String,
    pub profile: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum OrphanReason {
    SessionClosed,
    Duplicate,
    NoProject,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Orphan {
    pub reason: OrphanReason,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub since: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub of: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Guard {
    LiveSession,
    RunningDev,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Class {
    pub project_path: Option<String>,
    pub session: Option<String>,
    pub orphan: Option<Orphan>,
    pub guard: Option<Guard>,
    pub ignore: Option<&'static str>,
    pub rule: &'static str,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRow {
    pub pid: u32,
    pub start_time: u64,
    pub name: String,
    pub memory: u64,
    pub command_line: String,
    pub project_path: Option<String>,
    pub session: Option<String>,
    pub orphan: Option<Orphan>,
    pub guard: Option<Guard>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KillTarget {
    pub pid: u32,
    pub start_time: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct KillFailure {
    pub pid: u32,
    pub error: String,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct KillResult {
    pub killed: Vec<u32>,
    pub failed: Vec<KillFailure>,
}

struct Live {
    session: String,
    dir: Option<String>,
}

struct Classifier<'a> {
    procs: HashMap<u32, (&'a Proc, bool)>,
    children: HashMap<u32, Vec<u32>>,
    live: HashMap<u32, Live>,
    jobs: HashMap<u32, &'a str>,
    hooks: &'a [HookSession],
    projects: &'a [ProjectRef],
    root: String,
    rows: HashMap<u32, Class>,
}

fn lower_name(p: &Proc) -> String {
    p.name.to_lowercase()
}

fn cmd_of(p: &Proc) -> &str {
    p.cmd.as_deref().unwrap_or("")
}

fn is_profile_chrome(p: &Proc) -> bool {
    lower_name(p) == "chrome.exe" && cmd_of(p).to_lowercase().contains("chrome-profiles")
}

fn has_word(text: &str, word: &str) -> bool {
    let is_word = |c: char| c.is_alphanumeric() || c == '_';
    text.match_indices(word).any(|(i, _)| {
        let before = text[..i].chars().next_back().is_none_or(|c| !is_word(c));
        let after = text[i + word.len()..]
            .chars()
            .next()
            .is_none_or(|c| !is_word(c));
        before && after
    })
}

fn is_session_tool(p: &Proc) -> bool {
    if lower_name(p) == "rust-analyzer.exe" || is_profile_chrome(p) {
        return true;
    }
    let cmd = cmd_of(p).to_lowercase();
    ["chrome-devtools-mcp", "rea-agents", "rea mcp"]
        .iter()
        .any(|k| cmd.contains(k))
        || has_word(&cmd, "mcp")
}

fn profile_of(cmd: &str) -> Option<String> {
    let rest = &cmd[cmd.find("--user-data-dir=")? + "--user-data-dir=".len()..];
    let rest = rest.trim_start_matches('"');
    let value: String = rest
        .chars()
        .take_while(|c| !matches!(c, '"' | ' ' | '^'))
        .collect();
    let name = value.rsplit(['\\', '/']).next().unwrap_or(&value);
    (!name.is_empty()).then(|| name.to_lowercase())
}

fn normalized(path: &str) -> String {
    path.replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

impl<'a> Classifier<'a> {
    fn new(snap: &'a Snapshot, projects: &'a [ProjectRef], root: &str) -> Self {
        let mut procs: HashMap<u32, (&Proc, bool)> =
            snap.processes.iter().map(|p| (p.pid, (p, false))).collect();
        for p in &snap.outside_parents {
            procs.entry(p.pid).or_insert((p, true));
        }
        let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
        for (pid, (p, _)) in &procs {
            children.entry(p.ppid).or_default().push(*pid);
        }
        let is_claude = |pid: u32| {
            procs
                .get(&pid)
                .is_some_and(|(p, _)| lower_name(p) == "claude.exe")
        };
        let mut live = HashMap::new();
        for s in &snap.hook_sessions {
            if let Some(pid) = s.claude_pid.filter(|pid| is_claude(*pid)) {
                live.insert(
                    pid,
                    Live {
                        session: s.session_id.clone(),
                        dir: s.project_dir.clone(),
                    },
                );
            }
        }
        for a in &snap.agents {
            if let Some(pid) = a.pid.filter(|pid| procs.contains_key(pid)) {
                live.entry(pid).or_insert(Live {
                    session: a.session_id.clone().unwrap_or_default(),
                    dir: a.cwd.clone(),
                });
            }
        }
        let jobs = snap
            .dev_jobs
            .iter()
            .flat_map(|j| j.pids.iter().map(|pid| (*pid, j.project_path.as_str())))
            .collect();
        Self {
            procs,
            children,
            live,
            jobs,
            hooks: &snap.hook_sessions,
            projects,
            root: root.to_lowercase(),
            rows: HashMap::new(),
        }
    }

    fn project_of(&self, path: Option<&str>) -> Option<String> {
        let path = path?;
        self.projects
            .iter()
            .filter(|p| is_within(path, &p.path))
            .max_by_key(|p| p.path.len())
            .map(|p| p.path.clone())
    }

    fn ancestors(&self, pid: u32) -> Vec<u32> {
        let mut seen = Vec::new();
        let mut cur = self.procs.get(&pid).map(|(p, _)| p.ppid);
        while let Some(c) = cur.filter(|c| self.procs.contains_key(c) && !seen.contains(c)) {
            if seen.len() >= MAX_DEPTH {
                break;
            }
            seen.push(c);
            cur = self.procs.get(&c).map(|(p, _)| p.ppid);
        }
        seen
    }

    fn closed_since(&self, path: Option<&str>) -> Option<u64> {
        let path = normalized(path?);
        self.hooks
            .iter()
            .filter(|s| {
                s.project_dir
                    .as_deref()
                    .is_some_and(|d| normalized(d) == path)
            })
            .filter(|s| s.claude_pid.is_none_or(|pid| !self.live.contains_key(&pid)))
            .filter_map(|s| s.updated_at)
            .max()
    }

    fn session_class(&self, pid: u32, rule: &'static str) -> Class {
        let live = &self.live[&pid];
        Class {
            project_path: self.project_of(live.dir.as_deref()),
            session: Some(live.session.clone()),
            guard: Some(Guard::LiveSession),
            rule,
            ..Class::default()
        }
    }

    fn is_unverified_claude(&self, pid: u32) -> bool {
        let Some((p, _)) = self.procs.get(&pid) else {
            return false;
        };
        lower_name(p) == "claude.exe"
            && !is_daemon(cmd_of(p))
            && !self.live.contains_key(&pid)
            && self.live_child(pid).is_none()
    }

    fn visible(&self, p: &Proc) -> bool {
        let name = lower_name(p);
        if name == "chrome.exe" {
            return is_profile_chrome(p) && !cmd_of(p).contains("--type=");
        }
        SHOWN.contains(&name.as_str())
            || p.exe
                .as_deref()
                .is_some_and(|e| e.to_lowercase().starts_with(&self.root))
    }

    fn classify(&mut self, pid: u32, depth: usize) -> Class {
        if let Some(c) = self.rows.get(&pid) {
            return c.clone();
        }
        let p = self.procs[&pid].0;
        let name = lower_name(p);
        let cmd = cmd_of(p);
        let anc = self.ancestors(pid);
        let class = if name == "chrome.exe" && !is_profile_chrome(p) {
            Class {
                ignore: Some("user-browser"),
                rule: "user-browser",
                ..Class::default()
            }
        } else if name == "claude.exe" && is_daemon(cmd) {
            Class {
                ignore: Some("claude-daemon"),
                rule: "claude-daemon",
                ..Class::default()
            }
        } else if name == "claude.exe" && self.live.contains_key(&pid) {
            self.session_class(pid, "claude-itself")
        } else if let Some(child) = (name == "claude.exe" && cmd.contains("--bg-pty-host"))
            .then(|| self.live_child(pid))
            .flatten()
        {
            self.session_class(child, "pty-host-of-live-claude")
        } else if let Some(a) = anc.iter().find(|a| self.live.contains_key(a)) {
            self.session_class(*a, "descendant-of-live-claude")
        } else if let Some(project) = self.jobs.get(&pid) {
            Class {
                project_path: Some((*project).to_owned()),
                guard: Some(Guard::RunningDev),
                rule: "dev-job",
                ..Class::default()
            }
        } else if self.is_unverified_claude(pid) {
            Class {
                project_path: self.project_of(p.cwd.as_deref()),
                guard: Some(Guard::LiveSession),
                rule: "claude-unverified",
                ..Class::default()
            }
        } else if let Some(a) = anc.iter().find(|a| self.is_unverified_claude(**a)) {
            Class {
                project_path: self.project_of(self.procs[a].0.cwd.as_deref()),
                guard: Some(Guard::LiveSession),
                rule: "descendant-of-unverified-claude",
                ..Class::default()
            }
        } else if is_session_tool(p) {
            self.tool_class(p, &anc)
        } else if let Some(project) = self.project_of(p.cwd.as_deref()) {
            Class {
                project_path: Some(project),
                rule: "cwd",
                ..Class::default()
            }
        } else if INHERIT.contains(&name.as_str())
            && depth < MAX_DEPTH
            && self.procs.get(&p.ppid).is_some_and(|(_, outside)| !outside)
        {
            Class {
                rule: "inherited",
                ..self.classify(p.ppid, depth + 1)
            }
        } else {
            Class {
                orphan: Some(Orphan {
                    reason: OrphanReason::NoProject,
                    since: None,
                    of: None,
                }),
                rule: "no-project",
                ..Class::default()
            }
        };
        self.rows.insert(pid, class.clone());
        class
    }

    fn live_child(&self, pid: u32) -> Option<u32> {
        self.children
            .get(&pid)?
            .iter()
            .copied()
            .find(|c| self.live.contains_key(c))
    }

    fn tool_class(&self, p: &Proc, anc: &[u32]) -> Class {
        let in_editor = anc
            .iter()
            .any(|a| lower_name(self.procs[a].0) == "code.exe");
        if in_editor {
            return Class {
                project_path: self.project_of(p.cwd.as_deref()),
                rule: "editor-tool",
                ..Class::default()
            };
        }
        let by_profile = is_profile_chrome(p)
            .then(|| profile_of(cmd_of(p)))
            .flatten()
            .and_then(|name| {
                self.projects
                    .iter()
                    .find(|r| {
                        r.profile
                            .as_deref()
                            .is_some_and(|x| x.to_lowercase() == name)
                    })
                    .map(|r| r.path.clone())
            });
        let path = by_profile
            .or_else(|| self.project_of(p.cwd.as_deref()))
            .or_else(|| {
                anc.iter()
                    .find_map(|a| self.project_of(self.procs[a].0.cwd.as_deref()))
            });
        Class {
            orphan: Some(Orphan {
                reason: OrphanReason::SessionClosed,
                since: self.closed_since(path.as_deref()),
                of: None,
            }),
            project_path: path,
            rule: "tool-without-live-claude",
            ..Class::default()
        }
    }

    fn run(mut self) -> HashMap<u32, Class> {
        let own: Vec<u32> = self
            .procs
            .iter()
            .filter(|(_, (_, outside))| !outside)
            .map(|(pid, _)| *pid)
            .collect();
        for pid in &own {
            self.classify(*pid, 0);
        }
        for pid in &own {
            let p = self.procs[pid].0;
            let visible = self.visible(p) && !PASSTHROUGH.contains(&lower_name(p).as_str());
            if let Some(row) = self.rows.get_mut(pid) {
                row.visible = visible && row.ignore.is_none();
            }
        }
        self.mark_duplicates();
        self.rows
    }

    fn mark_duplicates(&mut self) {
        let mut groups: HashMap<(String, String, Option<&str>), Vec<u32>> = HashMap::new();
        for (pid, row) in &self.rows {
            let p = self.procs[pid].0;
            if let (true, Some(project), None) = (row.visible, &row.project_path, &row.orphan) {
                let key = (
                    project.clone(),
                    normalized(p.cwd.as_deref().unwrap_or("")),
                    p.cmd.as_deref(),
                );
                groups.entry(key).or_default().push(*pid);
            }
        }
        let mut roots: HashMap<u32, u32> = HashMap::new();
        for ((project, _, _), mut pids) in groups {
            if pids.len() < 2 {
                continue;
            }
            pids.sort_by_key(|pid| (self.procs[pid].0.start_time, *pid));
            let newest = pids[pids.len() - 1];
            for old in &pids[..pids.len() - 1] {
                let row = &self.rows[old];
                if row.session.is_none() && row.guard.is_none() {
                    self.rows.insert(
                        *old,
                        duplicate(Some(project.clone()), newest, "same-cmd-cwd-older", true),
                    );
                    roots.insert(*old, newest);
                }
            }
        }
        let pids: Vec<u32> = self.rows.keys().copied().collect();
        for pid in pids {
            let row = &self.rows[&pid];
            if roots.contains_key(&pid) || row.session.is_some() || row.guard.is_some() {
                continue;
            }
            if let Some(root) = self
                .ancestors(pid)
                .into_iter()
                .find(|a| roots.contains_key(a))
            {
                let row = &self.rows[&pid];
                let next = duplicate(
                    row.project_path.clone(),
                    roots[&root],
                    "under-duplicate",
                    row.visible,
                );
                self.rows.insert(pid, next);
            }
        }
    }
}

fn duplicate(project: Option<String>, of: u32, rule: &'static str, visible: bool) -> Class {
    Class {
        project_path: project,
        orphan: Some(Orphan {
            reason: OrphanReason::Duplicate,
            since: None,
            of: Some(of),
        }),
        rule,
        visible,
        ..Class::default()
    }
}

fn is_daemon(cmd: &str) -> bool {
    let lower = cmd.to_lowercase();
    lower
        .find("claude.exe")
        .map(|i| lower[i + "claude.exe".len()..].trim_start_matches('"'))
        .is_some_and(|rest| rest.split_whitespace().next() == Some("daemon"))
}

pub fn classify(snap: &Snapshot, projects: &[ProjectRef], root: &str) -> HashMap<u32, Class> {
    Classifier::new(snap, projects, root).run()
}

pub fn project_refs(tree: &ProjectTree) -> Vec<ProjectRef> {
    all_projects(tree)
        .map(|p| ProjectRef {
            path: p.path.clone(),
            profile: p.mcp.as_ref().and_then(|m| m.profile.clone()),
        })
        .collect()
}

pub fn mask(cmd: &str) -> String {
    const KEYS: [&str; 7] = [
        "api_key", "api-key", "apikey", "token", "secret", "password", "bearer",
    ];
    const PREFIXES: [&str; 4] = ["sk-", "ghp_", "github_pat_", "xox"];
    let mut hide_next = false;
    cmd.split(' ')
        .map(|part| {
            let lower = part.to_lowercase();
            if std::mem::take(&mut hide_next) && !part.is_empty() {
                return "***".to_owned();
            }
            let bare = lower.trim_start_matches(['-', '"']);
            if PREFIXES.iter().any(|p| bare.starts_with(p)) && bare.len() > 10 {
                return "***".to_owned();
            }
            if KEYS.iter().any(|k| {
                bare.split(['=', ':'])
                    .next()
                    .is_some_and(|key| key.contains(k))
            }) {
                return match part.find(['=', ':']) {
                    Some(i) if i + 1 < part.len() => format!("{}***", &part[..=i]),
                    Some(_) => part.to_owned(),
                    None => {
                        hide_next = part.starts_with('-');
                        part.to_owned()
                    }
                };
            }
            part.to_owned()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn short(cmd: &str) -> String {
    if cmd.chars().count() <= COMMAND_MAX {
        return cmd.to_owned();
    }
    let head: String = cmd.chars().take(COMMAND_MAX).collect();
    format!("{head}…")
}

pub fn rows(snap: &Snapshot, classes: &HashMap<u32, Class>) -> Vec<ProcessRow> {
    let mut out: Vec<ProcessRow> = snap
        .processes
        .iter()
        .filter_map(|p| {
            let c = classes.get(&p.pid).filter(|c| c.visible)?;
            Some(ProcessRow {
                pid: p.pid,
                start_time: p.start_time,
                name: p.name.clone(),
                memory: p.memory,
                command_line: short(cmd_of(p)),
                project_path: c.project_path.clone(),
                session: c.session.clone(),
                orphan: c.orphan.clone(),
                guard: c.guard,
            })
        })
        .collect();
    out.sort_by_key(|r| (r.orphan.is_none(), r.project_path.clone(), r.pid));
    out
}

fn proc_of(pid: Pid, p: &sysinfo::Process) -> Proc {
    let name = p.name().to_string_lossy().into_owned();
    let exe = p.exe().map(|e| e.to_string_lossy().into_owned());
    let args: Vec<String> = p
        .cmd()
        .iter()
        .map(|a| {
            let a = a.to_string_lossy();
            if a.contains(' ') && !a.starts_with('"') {
                format!("\"{a}\"")
            } else {
                a.into_owned()
            }
        })
        .collect();
    let user_chrome = name.eq_ignore_ascii_case("chrome.exe")
        && !args
            .iter()
            .any(|a| a.to_lowercase().contains("chrome-profiles"));
    let cmd = if user_chrome {
        exe.clone()
    } else {
        (!args.is_empty()).then(|| mask(&args.join(" ")))
    };
    Proc {
        pid: pid.as_u32(),
        ppid: p.parent().map(Pid::as_u32).unwrap_or(0),
        name,
        exe,
        cmd,
        cwd: p
            .cwd()
            .map(|c| c.to_string_lossy().into_owned())
            .filter(|c| !c.is_empty()),
        start_time: p.start_time() * 1000,
        memory: p.memory(),
    }
}

fn system() -> System {
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_cmd(UpdateKind::Always)
            .with_cwd(UpdateKind::Always)
            .with_exe(UpdateKind::Always)
            .with_memory(),
    );
    sys
}

pub fn read_hook_sessions() -> Vec<HookSession> {
    let Some(dir) = dirs::home_dir().map(|h| h.join(".claude").join("state").join("sessions"))
    else {
        return Vec::new();
    };
    std::fs::read_dir(dir)
        .map(|it| {
            it.filter_map(Result::ok)
                .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
                .filter_map(|e| std::fs::read_to_string(e.path()).ok())
                .filter_map(|t| serde_json::from_str(&t).ok())
                .collect()
        })
        .unwrap_or_default()
}

fn own_tree(all: &HashMap<u32, Proc>, me: u32) -> HashSet<u32> {
    let mut out = HashSet::from([me]);
    let mut cur = all.get(&me).map(|p| p.ppid);
    while let Some(pid) = cur {
        match all.get(&pid) {
            Some(p) if lower_name(p) != "claude.exe" && out.insert(pid) => cur = Some(p.ppid),
            _ => break,
        }
    }
    let mut stack = vec![me];
    while let Some(parent) = stack.pop() {
        for p in all.values().filter(|p| p.ppid == parent && p.pid != parent) {
            if out.insert(p.pid) {
                stack.push(p.pid);
            }
        }
    }
    out
}

fn all_but_own(sys: &System) -> HashMap<u32, Proc> {
    let mut all: HashMap<u32, Proc> = sys
        .processes()
        .iter()
        .map(|(pid, p)| (pid.as_u32(), proc_of(*pid, p)))
        .collect();
    for pid in own_tree(&all, std::process::id()) {
        all.remove(&pid);
    }
    all
}

pub fn table() -> HashMap<u32, Proc> {
    system()
        .processes()
        .iter()
        .map(|(pid, p)| (pid.as_u32(), proc_of(*pid, p)))
        .collect()
}

fn take(sys: &System, agents: Vec<AgentRef>, dev_jobs: Vec<DevJob>, root: &str) -> Snapshot {
    let all = all_but_own(sys);
    let root = root.to_lowercase();
    let job_pids: HashSet<u32> = dev_jobs
        .iter()
        .flat_map(|j| j.pids.iter().copied())
        .collect();
    let near_runtime = |p: &Proc| {
        let mut cur = p.ppid;
        for _ in 0..12 {
            match all.get(&cur) {
                Some(a) if matches!(lower_name(a).as_str(), "claude.exe" | "node.exe") => {
                    return true
                }
                Some(a) => cur = a.ppid,
                None => return false,
            }
        }
        false
    };
    let keep: HashSet<u32> = all
        .values()
        .filter(|p| {
            let name = lower_name(p);
            if job_pids.contains(&p.pid) {
                return true;
            }
            let captured = CAPTURED.contains(&name.as_str())
                || p.exe
                    .as_deref()
                    .is_some_and(|e| e.to_lowercase().starts_with(&root));
            if !captured {
                return false;
            }
            if name == "chrome.exe" && !is_profile_chrome(p) {
                return !cmd_of(p).contains("--type=");
            }
            if PASSTHROUGH.contains(&name.as_str()) {
                return near_runtime(p);
            }
            true
        })
        .map(|p| p.pid)
        .collect();
    let mut outside = HashSet::new();
    for pid in &keep {
        let mut cur = all[pid].ppid;
        for _ in 0..MAX_DEPTH {
            if keep.contains(&cur) || !outside.insert(cur) {
                break;
            }
            match all.get(&cur) {
                Some(p) => cur = p.ppid,
                None => break,
            }
        }
    }
    let mut processes: Vec<Proc> = keep.iter().map(|pid| all[pid].clone()).collect();
    processes.sort_by_key(|p| p.pid);
    Snapshot {
        processes,
        outside_parents: outside
            .iter()
            .filter_map(|pid| all.get(pid).cloned())
            .collect(),
        hook_sessions: read_hook_sessions(),
        agents,
        dev_jobs,
    }
}

pub fn snapshot(agents: Vec<AgentRef>, dev_jobs: Vec<DevJob>, root: &str) -> Snapshot {
    take(&system(), agents, dev_jobs, root)
}

pub fn list_processes(
    tree: &ProjectTree,
    agents: Vec<AgentRef>,
    dev_jobs: Vec<DevJob>,
    root: &Path,
) -> Vec<ProcessRow> {
    let root = root.to_string_lossy();
    let snap = snapshot(agents, dev_jobs, &root);
    let classes = classify(&snap, &project_refs(tree), &root);
    rows(&snap, &classes)
}

fn descendants(sys: &System, pid: u32) -> Vec<u32> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (p, proc_) in sys.processes() {
        if let Some(parent) = proc_.parent() {
            children
                .entry(parent.as_u32())
                .or_default()
                .push(p.as_u32());
        }
    }
    let mut out = Vec::new();
    let mut stack = vec![pid];
    while let Some(cur) = stack.pop() {
        for c in children.get(&cur).into_iter().flatten() {
            if !out.contains(c) && *c != pid {
                out.push(*c);
                stack.push(*c);
            }
        }
    }
    out
}

pub fn kill_processes(
    targets: &[KillTarget],
    confirmed: bool,
    tree: &ProjectTree,
    agents: Vec<AgentRef>,
    dev_jobs: Vec<DevJob>,
    root: &Path,
) -> KillResult {
    let root = root.to_string_lossy();
    let sys = system();
    let snap = take(&sys, agents, dev_jobs, &root);
    let classes = classify(&snap, &project_refs(tree), &root);
    let procs: HashMap<u32, &Proc> = snap.processes.iter().map(|p| (p.pid, p)).collect();
    let mut result = KillResult::default();
    let mut seen = HashSet::new();
    for target in targets.iter().filter(|t| seen.insert(t.pid)) {
        let pid = &target.pid;
        let fail = |error: &str| KillFailure {
            pid: *pid,
            error: error.to_owned(),
        };
        let Some(class) = classes.get(pid).filter(|c| c.visible) else {
            result
                .failed
                .push(fail("process is not in the current list"));
            continue;
        };
        if procs.get(pid).map(|p| p.start_time) != Some(target.start_time) {
            result
                .failed
                .push(fail("process changed, refresh the list"));
            continue;
        }
        if class.guard.is_some() && !confirmed {
            result.failed.push(fail("confirmation required"));
            continue;
        }
        let whole_tree =
            class.rule == "dev-job" || procs.get(pid).is_some_and(|p| is_profile_chrome(p));
        let mut victims = if whole_tree {
            descendants(&sys, *pid)
        } else {
            Vec::new()
        };
        victims.reverse();
        victims.push(*pid);
        let mut root_killed = false;
        for victim in victims {
            let ok = sys.process(Pid::from_u32(victim)).is_some_and(|p| p.kill());
            if victim == *pid {
                root_killed = ok;
            }
        }
        if root_killed {
            result.killed.push(*pid);
        } else {
            result.failed.push(fail("kill failed"));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Fixture {
        #[serde(flatten)]
        snapshot: Snapshot,
        projects: Vec<ProjectRef>,
        projects_root: String,
    }

    const PROCESSES: &str = include_str!("../../../specs/005-workbench/fixtures/processes.json");
    const EXPECTED: &str = include_str!("../../../specs/005-workbench/fixtures/expected.json");

    fn fixture() -> (Fixture, HashMap<u32, Class>) {
        let fx: Fixture = serde_json::from_str(PROCESSES).unwrap();
        let classes = classify(&fx.snapshot, &fx.projects, &fx.projects_root);
        (fx, classes)
    }

    #[test]
    fn fixture_matches_expected() {
        let (_, classes) = fixture();
        let expected: Vec<Value> = serde_json::from_str(EXPECTED).unwrap();
        let mut mismatches = Vec::new();
        for e in &expected {
            let pid = e["pid"].as_u64().unwrap() as u32;
            let c = &classes[&pid];
            let orphan: Option<Orphan> = e
                .get("orphan")
                .map(|o| serde_json::from_value(o.clone()).unwrap());
            let guard: Option<Guard> = e
                .get("guard")
                .map(|g| serde_json::from_value(g.clone()).unwrap());
            let same = c.project_path.as_deref() == e.get("projectPath").and_then(Value::as_str)
                && c.session.as_deref() == e.get("session").and_then(Value::as_str)
                && c.orphan == orphan
                && c.guard == guard
                && c.ignore == e.get("ignore").and_then(Value::as_str)
                && c.visible == e["visible"].as_bool().unwrap()
                && c.rule == e["rule"].as_str().unwrap();
            if !same {
                mismatches.push(format!("{pid} {}: got {c:?}, want {e}", e["name"]));
            }
        }
        assert_eq!(classes.len(), expected.len());
        assert!(mismatches.is_empty(), "{}", mismatches.join("\n"));
    }

    #[test]
    fn rows_put_orphans_first_and_hide_ignored() {
        let (fx, classes) = fixture();
        let rows = rows(&fx.snapshot, &classes);
        assert!(rows.iter().all(|r| r.name.to_lowercase() != "cmd.exe"));
        let first_project = rows.iter().position(|r| r.orphan.is_none()).unwrap();
        assert!(rows[..first_project].iter().all(|r| r.orphan.is_some()));
        assert!(rows[first_project..].iter().all(|r| r.orphan.is_none()));
    }

    fn proc(pid: u32, ppid: u32, name: &str, cmd: &str, cwd: &str) -> Proc {
        Proc {
            pid,
            ppid,
            name: name.into(),
            cmd: Some(cmd.into()),
            cwd: Some(cwd.into()),
            start_time: pid as u64,
            ..Proc::default()
        }
    }

    #[test]
    fn claude_without_hook_file_guards_itself_and_its_tools() {
        let snap = Snapshot {
            processes: vec![
                proc(10, 1, "claude.exe", "claude.exe", r"C:\P\AM"),
                proc(
                    11,
                    10,
                    "node.exe",
                    "node chrome-devtools-mcp.js",
                    r"C:\P\AM",
                ),
                proc(12, 10, "rust-analyzer.exe", "rust-analyzer.exe", r"C:\P\AM"),
            ],
            ..Snapshot::default()
        };
        let projects = [ProjectRef {
            path: r"C:\P\AM".into(),
            profile: None,
        }];
        let classes = classify(&snap, &projects, r"C:\P");
        for pid in [10, 11, 12] {
            let c = &classes[&pid];
            assert_eq!(c.guard, Some(Guard::LiveSession), "{pid}: {c:?}");
            assert_eq!(c.orphan, None, "{pid}: {c:?}");
            assert_eq!(c.project_path.as_deref(), Some(r"C:\P\AM"));
        }
    }

    #[test]
    fn guarded_descendant_of_duplicate_keeps_its_guard() {
        let snap = Snapshot {
            processes: vec![
                proc(20, 1, "node.exe", "node --watch a.ts", r"C:\P\AM"),
                proc(21, 1, "node.exe", "node --watch a.ts", r"C:\P\AM"),
                proc(22, 20, "node.exe", "node vite.js", r"C:\P\AM"),
            ],
            dev_jobs: vec![DevJob {
                project_path: r"C:\P\AM".into(),
                pids: vec![22],
            }],
            ..Snapshot::default()
        };
        let projects = [ProjectRef {
            path: r"C:\P\AM".into(),
            profile: None,
        }];
        let classes = classify(&snap, &projects, r"C:\P");
        assert_eq!(
            classes[&20].orphan.as_ref().map(|o| o.reason),
            Some(OrphanReason::Duplicate)
        );
        assert_eq!(classes[&22].guard, Some(Guard::RunningDev));
        assert_eq!(classes[&22].orphan, None);
    }

    #[test]
    fn own_tree_excludes_self_children_and_ancestors_up_to_claude() {
        let all: HashMap<u32, Proc> = [
            proc(1, 0, "claude.exe", "claude.exe", ""),
            proc(2, 1, "node.exe", "pnpm tauri dev", ""),
            proc(3, 2, "echo-studio.exe", "echo-studio.exe", ""),
            proc(4, 3, "msedgewebview2.exe", "msedgewebview2.exe", ""),
            proc(5, 1, "node.exe", "mcp", ""),
        ]
        .into_iter()
        .map(|p| (p.pid, p))
        .collect();
        let own = own_tree(&all, 3);
        assert_eq!(own, HashSet::from([2, 3, 4]));
    }

    #[test]
    fn mask_hides_secret_values() {
        assert_eq!(
            mask("node app.js --token abc123 --api-key=xyz API_KEY=q sk-abcdefghijkl plain"),
            "node app.js --token *** --api-key=*** API_KEY=*** *** plain"
        );
    }

    #[test]
    fn daemon_and_profile_parsing() {
        assert!(is_daemon(
            r"C:\Users\me\.local\bin\claude.exe daemon run --origin transient"
        ));
        assert!(!is_daemon(
            r"C:\Users\me\.local\bin\claude.exe --bg-pty-host \\.\pipe\x"
        ));
        assert_eq!(
            profile_of(
                r#"cmd /c "npx ^chrome-devtools-mcp^ ^--user-data-dir=C:\Users\me\.cache\chrome-profiles\am-2^""#
            ),
            Some("am-2".into())
        );
        assert!(has_word("x mcp", "mcp"));
        assert!(!has_word("mcpserver", "mcp"));
    }

    #[test]
    fn live_snapshot_classifies_without_panics() {
        let snap = snapshot(Vec::new(), Vec::new(), r"C:\Users\nobody\Projects");
        let classes = classify(&snap, &[], r"C:\Users\nobody\Projects");
        assert_eq!(classes.len(), snap.processes.len());
    }
}
