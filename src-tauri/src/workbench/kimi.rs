use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Emitter};

use super::sessions::{is_short_id, ClaudeSession, HookState, Kind, Started, Status};
use super::terminal::EVENT_EXIT;
use super::{child_command, is_claude_env, projects};
use crate::agent::{self, AgentKind, Profile};

const REPLAY_CAP: usize = 2 << 20;
const EXITED_WINDOW_MS: u64 = 3_600_000;
const TERM_PREFIX: &str = "k";

struct Output {
    buf: Vec<u8>,
    sub: Option<(String, Channel<Response>)>,
}

struct Host {
    cwd: String,
    session_id: Option<String>,
    pid: u32,
    started_at: u64,
    exited_at: Option<u64>,
    term: Option<String>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    out: Arc<Mutex<Output>>,
}

#[derive(Default)]
pub struct Hosts {
    next: AtomicU64,
    map: Mutex<HashMap<String, Host>>,
}

pub static HOSTS: LazyLock<Hosts> = LazyLock::new(Hosts::default);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Exited {
    terminal_id: String,
    code: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lock {
    pub pid: u32,
    #[serde(default)]
    pub started_at: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn is_session_id(id: &str) -> bool {
    id.strip_prefix("session_").is_some_and(|rest| {
        let groups: Vec<&str> = rest.split('-').collect();
        groups.len() == 5
            && groups
                .iter()
                .zip([8, 4, 4, 4, 12])
                .all(|(g, n)| g.len() == n && g.bytes().all(|b| b.is_ascii_hexdigit()))
    })
}

pub fn is_terminal(id: &str) -> bool {
    id.starts_with(TERM_PREFIX)
}

fn fresh_short_id(taken: &HashSet<String>) -> String {
    let state = std::collections::hash_map::RandomState::new();
    loop {
        let mut h = state.build_hasher();
        h.write_u64(now_ms());
        h.write_u64(HOSTS.next.fetch_add(1, Ordering::Relaxed));
        let id = format!("{:08x}", h.finish() as u32);
        if !taken.contains(&id) {
            return id;
        }
    }
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(2),
        cols: cols.max(10),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn kimi() -> Result<Profile, String> {
    let home = agent::home().ok_or("Не найдена домашняя папка")?;
    Ok(Profile::of(AgentKind::Kimi, &home))
}

pub fn read_locks(dir: &Path) -> HashMap<String, Lock> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return HashMap::new();
    };
    entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "lock"))
        .filter_map(|p| {
            let id = p.file_stem()?.to_string_lossy().into_owned();
            let lock = serde_json::from_str::<Lock>(&std::fs::read_to_string(&p).ok()?).ok()?;
            is_session_id(&id).then_some((id, lock))
        })
        .collect()
}

pub fn session_for_pid(locks: &HashMap<String, Lock>, pid: u32) -> Option<String> {
    locks
        .iter()
        .filter(|(_, l)| l.pid == pid)
        .max_by_key(|(_, l)| l.started_at)
        .map(|(id, _)| id.clone())
}

pub fn work_dirs(index: &str) -> HashMap<String, String> {
    index
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter_map(|v| {
            Some((
                v.get("sessionId")?.as_str()?.to_owned(),
                v.get("workDir")?.as_str()?.to_owned(),
            ))
        })
        .collect()
}

fn alive_kimis(pids: &[u32]) -> HashSet<u32> {
    if pids.is_empty() {
        return HashSet::new();
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
                .is_some_and(|p| p.name().eq_ignore_ascii_case(agent::KIMI_EXE))
        })
        .collect()
}

pub fn hook_status(hook: Option<&HookState>) -> Status {
    match hook.and_then(|h| h.state.as_deref()) {
        Some("working") => Status::Working,
        Some("waiting") => Status::Waiting,
        Some("error") => Status::Error,
        Some("done") => Status::Done,
        _ => Status::Idle,
    }
}

impl Hosts {
    pub fn start(
        &self,
        app: AppHandle,
        project: &Path,
        resume: Option<&str>,
    ) -> Result<Started, String> {
        if let Some(id) = resume {
            if !is_session_id(id) {
                return Err(format!("Неверный id сессии Kimi: {id}"));
            }
            if let Some(short) = self.live_short_for(id) {
                return Ok(Started {
                    session_id: Some(id.to_owned()),
                    short_id: short,
                });
            }
            if let Ok(mut map) = self.map.lock() {
                map.retain(|_, h| h.exited_at.is_none() || h.session_id.as_deref() != Some(id));
            }
        }
        let profile = kimi()?;
        let cli = profile
            .find_cli()
            .ok_or_else(|| format!("{} не найден", profile.exe))?;
        let pair = native_pty_system()
            .openpty(size(120, 40))
            .map_err(|e| format!("Не удалось открыть терминал: {e}"))?;
        let mut cmd = CommandBuilder::new(cli);
        if let Some(id) = resume {
            cmd.args(profile.resume_args(id));
        }
        cmd.cwd(project);
        for (key, _) in std::env::vars_os() {
            if is_claude_env(&key.to_string_lossy()) {
                cmd.env_remove(key);
            }
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Не удалось запустить kimi: {e}"))?;
        let pid = child.process_id().unwrap_or(0);
        let killer = child.clone_killer();
        drop(pair.slave);
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Не удалось читать терминал: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Не удалось писать в терминал: {e}"))?;
        let out = Arc::new(Mutex::new(Output {
            buf: Vec::new(),
            sub: None,
        }));
        let short_id = {
            let mut map = self.map.lock().map_err(|_| "Сбой реестра Kimi")?;
            let short_id = fresh_short_id(&map.keys().cloned().collect());
            map.insert(
                short_id.clone(),
                Host {
                    cwd: project.to_string_lossy().into_owned(),
                    session_id: resume.map(String::from),
                    pid,
                    started_at: now_ms(),
                    exited_at: None,
                    term: None,
                    master: pair.master,
                    writer,
                    killer,
                    out: out.clone(),
                },
            );
            short_id
        };
        {
            let out = out.clone();
            std::thread::spawn(move || {
                let mut buf = [0u8; 65536];
                while let Ok(n) = reader.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    let Ok(mut o) = out.lock() else { break };
                    o.buf.extend_from_slice(&buf[..n]);
                    if o.buf.len() > REPLAY_CAP {
                        let excess = o.buf.len() - REPLAY_CAP;
                        o.buf.drain(..excess);
                    }
                    let failed = o
                        .sub
                        .as_ref()
                        .is_some_and(|(_, ch)| ch.send(Response::new(buf[..n].to_vec())).is_err());
                    if failed {
                        o.sub = None;
                    }
                }
            });
        }
        {
            let short_id = short_id.clone();
            std::thread::spawn(move || {
                let code = child.wait().map(|s| s.exit_code()).unwrap_or(1);
                let term = HOSTS.mark_exited(&short_id);
                if let Some(terminal_id) = term {
                    let _ = app.emit(EVENT_EXIT, Exited { terminal_id, code });
                }
            });
        }
        Ok(Started {
            session_id: Some(resume.map_or_else(|| short_id.clone(), String::from)),
            short_id,
        })
    }

    fn mark_exited(&self, short_id: &str) -> Option<String> {
        let mut map = self.map.lock().ok()?;
        let host = map.get_mut(short_id)?;
        host.exited_at = Some(now_ms());
        if let Ok(mut o) = host.out.lock() {
            o.sub = None;
        }
        host.term.take()
    }

    fn live_short_for(&self, session_id: &str) -> Option<String> {
        let map = self.map.lock().ok()?;
        map.iter()
            .find(|(_, h)| h.exited_at.is_none() && h.session_id.as_deref() == Some(session_id))
            .map(|(k, _)| k.clone())
    }

    pub fn is_hosted(&self, short_id: &str) -> bool {
        self.map.lock().is_ok_and(|m| m.contains_key(short_id))
    }

    pub fn live_count(&self) -> usize {
        self.map
            .lock()
            .map(|m| m.values().filter(|h| h.exited_at.is_none()).count())
            .unwrap_or(0)
    }

    pub fn attach(
        &self,
        short_id: &str,
        cols: u16,
        rows: u16,
        on_data: Channel<Response>,
    ) -> Result<String, String> {
        let terminal_id = format!("{TERM_PREFIX}{}", self.next.fetch_add(1, Ordering::Relaxed));
        let mut map = self.map.lock().map_err(|_| "Сбой реестра Kimi")?;
        let host = map
            .get_mut(short_id)
            .ok_or_else(|| format!("Нет сессии Kimi {short_id}"))?;
        if host.exited_at.is_some() {
            return Err("Сессия Kimi завершилась".into());
        }
        let _ = host.master.resize(size(cols, rows));
        {
            let mut out = host.out.lock().map_err(|_| "Сбой буфера терминала")?;
            if !out.buf.is_empty() {
                on_data
                    .send(Response::new(out.buf.clone()))
                    .map_err(|e| e.to_string())?;
            }
            out.sub = Some((terminal_id.clone(), on_data));
        }
        host.term = Some(terminal_id.clone());
        Ok(terminal_id)
    }

    fn with_terminal<T>(
        &self,
        terminal_id: &str,
        f: impl FnOnce(&mut Host) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut map = self.map.lock().map_err(|_| "Сбой реестра Kimi")?;
        let host = map
            .values_mut()
            .find(|h| h.term.as_deref() == Some(terminal_id))
            .ok_or_else(|| format!("Нет терминала {terminal_id}"))?;
        f(host)
    }

    pub fn write(&self, terminal_id: &str, data: &str) -> Result<(), String> {
        self.with_terminal(terminal_id, |h| {
            h.writer
                .write_all(data.as_bytes())
                .and_then(|_| h.writer.flush())
                .map_err(|e| format!("Не удалось записать в терминал: {e}"))
        })
    }

    pub fn resize(&self, terminal_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        self.with_terminal(terminal_id, |h| {
            h.master
                .resize(size(cols, rows))
                .map_err(|e| format!("Не удалось изменить размер терминала: {e}"))
        })
    }

    pub fn detach(&self, terminal_id: &str) {
        if let Ok(mut map) = self.map.lock() {
            if let Some(h) = map
                .values_mut()
                .find(|h| h.term.as_deref() == Some(terminal_id))
            {
                h.term = None;
                if let Ok(mut o) = h.out.lock() {
                    o.sub = None;
                }
            }
        }
    }

    pub fn detach_all(&self) {
        if let Ok(mut map) = self.map.lock() {
            for h in map.values_mut() {
                h.term = None;
                if let Ok(mut o) = h.out.lock() {
                    o.sub = None;
                }
            }
        }
    }

    pub fn stop(&self, short_id: &str) -> Result<(), String> {
        let pid = {
            let mut map = self.map.lock().map_err(|_| "Сбой реестра Kimi")?;
            let host = map
                .get_mut(short_id)
                .ok_or_else(|| format!("Нет сессии Kimi {short_id}"))?;
            if host.exited_at.is_some() {
                return Ok(());
            }
            let pid = host.pid;
            if pid == 0 {
                let _ = host.killer.kill();
            }
            pid
        };
        if pid != 0 {
            let _ = child_command("taskkill")
                .args(["/T", "/F", "/PID", &pid.to_string()])
                .status();
        }
        Ok(())
    }

    pub fn stop_all(&self) {
        let ids: Vec<String> = self
            .map
            .lock()
            .map(|m| {
                m.iter()
                    .filter(|(_, h)| h.exited_at.is_none())
                    .map(|(k, _)| k.clone())
                    .collect()
            })
            .unwrap_or_default();
        for id in ids {
            let _ = self.stop(&id);
        }
    }

    pub fn forget(&self, short_id: &str) -> Result<(), String> {
        let mut map = self.map.lock().map_err(|_| "Сбой реестра Kimi")?;
        if map.get(short_id).is_some_and(|h| h.exited_at.is_none()) {
            return Err("Сессия Kimi ещё работает".into());
        }
        map.remove(short_id);
        Ok(())
    }

    pub fn restart(
        &self,
        app: AppHandle,
        project: &Path,
        session_id: &str,
        short_id: &str,
    ) -> Result<Started, String> {
        if self.is_hosted(short_id) {
            self.stop(short_id)?;
            for _ in 0..50 {
                let done = self
                    .map
                    .lock()
                    .map(|m| m.get(short_id).is_none_or(|h| h.exited_at.is_some()))
                    .unwrap_or(true);
                if done {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            let _ = self.forget(short_id);
        }
        let resume = is_session_id(session_id).then_some(session_id);
        self.start(app, project, resume)
    }

    fn refresh_ids(&self, locks: &HashMap<String, Lock>) {
        if let Ok(mut map) = self.map.lock() {
            let now = now_ms();
            map.retain(|_, h| {
                h.exited_at
                    .is_none_or(|t| t.saturating_add(EXITED_WINDOW_MS) >= now)
            });
            for h in map.values_mut().filter(|h| h.exited_at.is_none()) {
                if let Some(id) = session_for_pid(locks, h.pid) {
                    h.session_id = Some(id);
                }
            }
        }
    }

    fn snapshot(&self, hooks: &HashMap<String, HookState>) -> Vec<ClaudeSession> {
        let Ok(map) = self.map.lock() else {
            return Vec::new();
        };
        map.iter()
            .map(|(short, h)| {
                let session_id = h.session_id.clone().unwrap_or_else(|| short.clone());
                let hook = hooks
                    .get(&session_id)
                    .filter(|x| x.updated_at.is_none_or(|t| t >= h.started_at));
                ClaudeSession {
                    short_id: Some(short.clone()),
                    kind: Kind::Shell,
                    cwd: Some(h.cwd.clone()),
                    name: None,
                    status: if h.exited_at.is_some() {
                        Status::Exited
                    } else {
                        hook_status(hook)
                    },
                    phase: hook.and_then(|x| x.phase.clone()),
                    tool: hook.and_then(|x| x.tool.clone()),
                    since: hook.and_then(|x| x.since).or(Some(h.started_at)),
                    pid: Some(h.pid).filter(|p| *p != 0),
                    transcript: None,
                    exited_at: h.exited_at,
                    shells: false,
                    agent: AgentKind::Kimi,
                    session_id,
                }
            })
            .collect()
    }

    fn hosted_pids(&self) -> HashSet<u32> {
        self.map
            .lock()
            .map(|m| m.values().map(|h| h.pid).collect())
            .unwrap_or_default()
    }
}

fn titles(index: &str, ids: &[String]) -> HashMap<String, String> {
    let dirs: HashMap<String, PathBuf> = index
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter_map(|v| {
            Some((
                v.get("sessionId")?.as_str()?.to_owned(),
                PathBuf::from(v.get("sessionDir")?.as_str()?),
            ))
        })
        .collect();
    ids.iter()
        .filter_map(|id| {
            let state = std::fs::read_to_string(dirs.get(id)?.join("state.json")).ok()?;
            let v = serde_json::from_str::<Value>(&state).ok()?;
            let title = v.get("title")?.as_str()?.trim().to_owned();
            (!title.is_empty()).then(|| (id.clone(), title))
        })
        .collect()
}

pub fn hosted(hooks: &HashMap<String, HookState>) -> Vec<ClaudeSession> {
    let Ok(profile) = kimi() else {
        return HOSTS.snapshot(hooks);
    };
    let locks = read_locks(&profile.home.join("locks").join("sessions"));
    HOSTS.refresh_ids(&locks);
    HOSTS.snapshot(hooks)
}

pub fn list(hooks: &HashMap<String, HookState>) -> Vec<ClaudeSession> {
    let Ok(profile) = kimi() else {
        return HOSTS.snapshot(hooks);
    };
    let locks = read_locks(&profile.home.join("locks").join("sessions"));
    HOSTS.refresh_ids(&locks);
    let mut list = HOSTS.snapshot(hooks);
    let hosted = HOSTS.hosted_pids();
    let pids: Vec<u32> = locks
        .values()
        .map(|l| l.pid)
        .filter(|p| !hosted.contains(p))
        .collect();
    let alive = alive_kimis(&pids);
    let index =
        std::fs::read_to_string(profile.home.join("session_index.jsonl")).unwrap_or_default();
    let cwd_of = work_dirs(&index);
    let tree = super::projects_root().map(|root| projects::scan(&root));
    for (id, lock) in &locks {
        if hosted.contains(&lock.pid) || !alive.contains(&lock.pid) {
            continue;
        }
        let cwd = cwd_of.get(id).cloned();
        let inside = match (&tree, cwd.as_deref()) {
            (Some(tree), Some(cwd)) => projects::place_for(tree, cwd).is_some(),
            _ => false,
        };
        if !inside {
            continue;
        }
        let hook = hooks.get(id);
        list.push(ClaudeSession {
            session_id: id.clone(),
            short_id: None,
            kind: Kind::External,
            cwd,
            name: None,
            status: hook_status(hook),
            phase: hook.and_then(|x| x.phase.clone()),
            tool: hook.and_then(|x| x.tool.clone()),
            since: hook.and_then(|x| x.since).or(Some(lock.started_at)),
            pid: Some(lock.pid),
            transcript: None,
            exited_at: None,
            shells: false,
            agent: AgentKind::Kimi,
        });
    }
    let ids: Vec<String> = list
        .iter()
        .map(|s| s.session_id.clone())
        .filter(|id| is_session_id(id))
        .collect();
    let names = titles(&index, &ids);
    for s in &mut list {
        if let Some(t) = names.get(&s.session_id) {
            s.name = Some(t.clone());
        }
    }
    list
}

pub fn session_pid(session_id: &str) -> Result<u32, String> {
    if !is_session_id(session_id) {
        return Err(format!("Неверный id сессии Kimi: {session_id}"));
    }
    let profile = kimi()?;
    let locks = read_locks(&profile.home.join("locks").join("sessions"));
    let pid = locks
        .get(session_id)
        .map(|l| l.pid)
        .ok_or("Сессия Kimi не открыта")?;
    if alive_kimis(&[pid]).contains(&pid) {
        Ok(pid)
    } else {
        Err("Процесс сессии не запущен".to_owned())
    }
}

pub fn ensure_hosted(short_id: &str) -> Result<(), String> {
    if !is_short_id(short_id) {
        return Err(format!("Неверный короткий id: {short_id}"));
    }
    if HOSTS.is_hosted(short_id) {
        Ok(())
    } else {
        Err(format!("Нет сессии Kimi {short_id}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kimi_session_ids() {
        assert!(is_session_id(
            "session_7b06886c-a8d5-4f65-8acb-52c06b955bc1"
        ));
        assert!(!is_session_id("7b06886c-a8d5-4f65-8acb-52c06b955bc1"));
        assert!(!is_session_id("session_../../x"));
        assert!(!is_session_id("session_7b06886c"));
    }

    #[test]
    fn lock_files_map_pid_to_latest_session() {
        let dir = tempfile::tempdir().unwrap();
        let write = |name: &str, text: &str| std::fs::write(dir.path().join(name), text).unwrap();
        write(
            "session_00000000-0000-0000-0000-000000000001.lock",
            r#"{"version":1,"pid":3600,"startedAt":10,"clientIdentity":"kimi_code_cli"}"#,
        );
        write(
            "session_00000000-0000-0000-0000-000000000002.lock",
            r#"{"version":1,"pid":3600,"startedAt":20}"#,
        );
        write(
            "session_00000000-0000-0000-0000-000000000003.lock",
            r#"{"pid":7,"startedAt":5}"#,
        );
        write("session_bad.lock", r#"{"pid":9}"#);
        write("broken.lock", "{");
        let locks = read_locks(dir.path());
        assert_eq!(locks.len(), 3);
        assert_eq!(
            session_for_pid(&locks, 3600).as_deref(),
            Some("session_00000000-0000-0000-0000-000000000002")
        );
        assert_eq!(session_for_pid(&locks, 1), None);
        assert!(read_locks(&dir.path().join("missing")).is_empty());
    }

    #[test]
    fn session_index_gives_work_dirs() {
        let index = concat!(
            r#"{"sessionId":"session_a","sessionDir":"C:/k/s/a","workDir":"C:\\P\\A"}"#,
            "\n{broken\n",
            r#"{"sessionId":"session_b","workDir":"C:\\P\\B"}"#,
        );
        let dirs = work_dirs(index);
        assert_eq!(dirs.get("session_a").map(String::as_str), Some(r"C:\P\A"));
        assert_eq!(dirs.get("session_b").map(String::as_str), Some(r"C:\P\B"));
    }

    #[test]
    fn hook_states_map_to_status() {
        let hook = |s: &str| HookState {
            state: Some(s.into()),
            ..HookState::default()
        };
        assert_eq!(hook_status(Some(&hook("working"))), Status::Working);
        assert_eq!(hook_status(Some(&hook("done"))), Status::Done);
        assert_eq!(hook_status(Some(&hook("error"))), Status::Error);
        assert_eq!(hook_status(None), Status::Idle);
    }

    #[test]
    fn terminal_ids_are_prefixed() {
        assert!(is_terminal("k3"));
        assert!(!is_terminal("t3"));
    }
}
