use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use windows_sys::Win32::Foundation::{CloseHandle, FALSE, HANDLE, TRUE};
use windows_sys::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCPROW_OWNER_PID, TCP_TABLE_OWNER_PID_LISTENER,
};
use windows_sys::Win32::Networking::WinSock::{AF_INET, AF_INET6};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicProcessIdList, OpenJobObjectW,
    QueryInformationJobObject, TerminateJobObject,
};
use windows_sys::Win32::System::Threading::{
    CREATE_BREAKAWAY_FROM_JOB, CREATE_NEW_PROCESS_GROUP, CREATE_NO_WINDOW,
};

use super::processes::{self, Proc};

pub const EVENT_DEV: &str = "workbench://dev";
const JOB_OBJECT_QUERY: u32 = 0x0004;
const JOB_OBJECT_TERMINATE: u32 = 0x0008;
const ERROR_ACCESS_DENIED: i32 = 5;
const ERROR_INSUFFICIENT_BUFFER: u32 = 122;
const SEEN_MAX: usize = 4096;
const SWEEP_SLACK_MS: u64 = 1_000;
const HEARTBEAT_TICKS: u32 = 25;
const LOG_PORT_SCAN: u64 = 64 * 1024;
const STARTING_FOR: u64 = 30_000;
const TAIL_MAX: u64 = 2 * 1024 * 1024;
const TAIL_POLL: Duration = Duration::from_millis(200);
const FAST_POLL: Duration = Duration::from_secs(2);
const SLOW_POLL: Duration = Duration::from_secs(10);
const MAX_JOB_PIDS: usize = 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct DevFile {
    project_path: String,
    command: String,
    pid: u32,
    started_at: u64,
    #[serde(default)]
    seen: Vec<(u32, u64)>,
    #[serde(default)]
    exit_code: Option<i32>,
    #[serde(default)]
    stopped: bool,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DevState {
    Starting,
    Running,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DevServer {
    pub project_path: String,
    pub command: String,
    pub state: DevState,
    pub ports: Vec<u16>,
    pub started_at: u64,
    pub exit_code: Option<i32>,
    pub log: String,
    #[serde(skip)]
    pub pids: Vec<u32>,
}

#[derive(Default)]
struct Runtime {
    stopping: bool,
}

static RUNTIME: LazyLock<Mutex<HashMap<String, Runtime>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static TAILS: LazyLock<Mutex<HashMap<u32, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_TAIL: AtomicU32 = AtomicU32::new(1);
static FILES: Mutex<()> = Mutex::new(());

pub fn state_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| {
        d.join("com.stillmvd.echo-studio")
            .join("workbench")
            .join("dev")
    })
}

pub fn slug(project_path: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in project_path
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
        .bytes()
    {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

fn job_name(slug: &str) -> Vec<u16> {
    format!("Local\\EchoStudio.dev.{slug}")
        .encode_utf16()
        .chain(Some(0))
        .collect()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn runtime() -> std::sync::MutexGuard<'static, HashMap<String, Runtime>> {
    RUNTIME.lock().unwrap_or_else(|e| e.into_inner())
}

struct Job(HANDLE);

unsafe impl Send for Job {}

impl Drop for Job {
    fn drop(&mut self) {
        unsafe { CloseHandle(self.0) };
    }
}

impl Job {
    fn create(slug: &str) -> Result<Self, String> {
        let name = job_name(slug);
        let inherit = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: std::ptr::null_mut(),
            bInheritHandle: TRUE,
        };
        let handle = unsafe { CreateJobObjectW(&inherit, name.as_ptr()) };
        if handle.is_null() {
            return Err(format!(
                "CreateJobObjectW: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(Self(handle))
    }

    fn open(slug: &str) -> Option<Self> {
        let name = job_name(slug);
        let handle = unsafe {
            OpenJobObjectW(
                JOB_OBJECT_QUERY | JOB_OBJECT_TERMINATE,
                FALSE,
                name.as_ptr(),
            )
        };
        (!handle.is_null()).then_some(Self(handle))
    }

    fn assign(&self, child: &Child) -> Result<(), String> {
        let ok = unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) };
        if ok == 0 {
            return Err(format!(
                "AssignProcessToJobObject: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }

    fn pids(&self) -> Vec<u32> {
        let mut buf = vec![0usize; 2 + MAX_JOB_PIDS];
        let size = (buf.len() * size_of::<usize>()) as u32;
        let ok = unsafe {
            QueryInformationJobObject(
                self.0,
                JobObjectBasicProcessIdList,
                buf.as_mut_ptr().cast(),
                size,
                std::ptr::null_mut(),
            )
        };
        if ok == 0 {
            return Vec::new();
        }
        let header = buf[0] as u64;
        let listed = (header >> 32) as usize;
        buf[1..1 + listed.min(MAX_JOB_PIDS)]
            .iter()
            .map(|p| *p as u32)
            .collect()
    }

    fn terminate(&self) -> bool {
        unsafe { TerminateJobObject(self.0, 1) != 0 }
    }
}

fn tcp_table(family: u16) -> Vec<u8> {
    let mut size: u32 = 0;
    unsafe {
        GetExtendedTcpTable(
            std::ptr::null_mut(),
            &mut size,
            FALSE,
            u32::from(family),
            TCP_TABLE_OWNER_PID_LISTENER,
            0,
        )
    };
    for _ in 0..3 {
        let mut buf = vec![0u8; size as usize + 4096];
        size = buf.len() as u32;
        let rc = unsafe {
            GetExtendedTcpTable(
                buf.as_mut_ptr().cast(),
                &mut size,
                FALSE,
                u32::from(family),
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        match rc {
            0 => return buf,
            ERROR_INSUFFICIENT_BUFFER => continue,
            _ => return Vec::new(),
        }
    }
    Vec::new()
}

fn rows_of<T: Copy>(buf: &[u8]) -> Vec<T> {
    if buf.len() < 4 {
        return Vec::new();
    }
    let count = u32::from_ne_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
    let offset = std::mem::align_of::<T>().max(4);
    (0..count)
        .filter_map(|i| {
            let start = offset + i * size_of::<T>();
            let bytes = buf.get(start..start + size_of::<T>())?;
            Some(unsafe { std::ptr::read_unaligned(bytes.as_ptr().cast::<T>()) })
        })
        .collect()
}

fn port_of(raw: u32) -> u16 {
    u16::from_be(raw as u16)
}

pub fn listeners() -> Vec<(u32, u16)> {
    let v4 = rows_of::<MIB_TCPROW_OWNER_PID>(&tcp_table(AF_INET))
        .into_iter()
        .map(|r| (r.dwOwningPid, port_of(r.dwLocalPort)));
    let v6 = rows_of::<MIB_TCP6ROW_OWNER_PID>(&tcp_table(AF_INET6))
        .into_iter()
        .map(|r| (r.dwOwningPid, port_of(r.dwLocalPort)));
    v4.chain(v6).collect()
}

pub fn ports_for(pids: &[u32], table: &[(u32, u16)]) -> Vec<u16> {
    let pids: HashSet<u32> = pids.iter().copied().collect();
    let mut ports: Vec<u16> = table
        .iter()
        .filter(|(pid, _)| pids.contains(pid))
        .map(|(_, port)| *port)
        .collect();
    ports.sort_unstable();
    ports.dedup();
    ports
}

fn read_file(dir: &Path, slug: &str) -> Option<DevFile> {
    let text = fs::read_to_string(dir.join(format!("{slug}.json"))).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_file(dir: &Path, slug: &str, file: &DevFile) -> Result<(), String> {
    let tmp = dir.join(format!("{slug}.json.tmp"));
    let text = serde_json::to_string(file).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join(format!("{slug}.json"))).map_err(|e| e.to_string())
}

fn update_file(dir: &Path, slug: &str, change: impl FnOnce(&mut DevFile)) -> Result<(), String> {
    let _lock = FILES.lock().unwrap_or_else(|e| e.into_inner());
    let mut file = read_file(dir, slug).ok_or("dev server was never started")?;
    change(&mut file);
    write_file(dir, slug, &file)
}

fn server(dir: &Path, slug: &str, file: DevFile, table: &[(u32, u16)], now: u64) -> DevServer {
    let pids = Job::open(slug).map(|j| j.pids()).unwrap_or_default();
    let fresh: Vec<u32> = pids
        .iter()
        .copied()
        .filter(|p| !file.seen.iter().any(|(s, _)| s == p))
        .collect();
    if !fresh.is_empty() && file.seen.len() < SEEN_MAX {
        let found = start_times(&fresh);
        let _ = update_file(dir, slug, |f| {
            for pair in found {
                if !f.seen.contains(&pair) {
                    f.seen.push(pair);
                }
            }
        });
    }
    let ports = ports_for(&pids, table);
    let exit_code = file.exit_code;
    let state = match (pids.is_empty(), exit_code) {
        (false, _) if ports.is_empty() && now.saturating_sub(file.started_at) < STARTING_FOR => {
            DevState::Starting
        }
        (false, _) => DevState::Running,
        (true, Some(code)) if code != 0 => DevState::Error,
        (true, _) => DevState::Stopped,
    };
    DevServer {
        project_path: file.project_path,
        command: file.command,
        state,
        ports,
        started_at: file.started_at,
        exit_code,
        log: dir
            .join(format!("{slug}.log"))
            .to_string_lossy()
            .into_owned(),
        pids,
    }
}

pub fn list_in(dir: &Path) -> Vec<DevServer> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let table = listeners();
    let now = now_ms();
    let mut out: Vec<DevServer> = entries
        .filter_map(Result::ok)
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let slug = name.strip_suffix(".json")?.to_owned();
            let file = read_file(dir, &slug)?;
            Some(server(dir, &slug, file, &table, now))
        })
        .collect();
    out.sort_by(|a, b| a.project_path.cmp(&b.project_path));
    out
}

pub fn list() -> Vec<DevServer> {
    state_dir().map(|d| list_in(&d)).unwrap_or_default()
}

pub fn jobs() -> Vec<processes::DevJob> {
    list()
        .into_iter()
        .filter(|s| !s.pids.is_empty())
        .map(|s| processes::DevJob {
            project_path: s.project_path,
            pids: s.pids,
        })
        .collect()
}

fn spawn(cwd: &Path, line: &str, log: &File, breakaway: bool) -> std::io::Result<Child> {
    let mut flags = CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP;
    if breakaway {
        flags |= CREATE_BREAKAWAY_FROM_JOB;
    }
    super::child_command("cmd.exe")
        .raw_arg(format!("/d /s /c \"{line}\""))
        .current_dir(cwd)
        .env("FORCE_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(log.try_clone()?)
        .stderr(log.try_clone()?)
        .creation_flags(flags)
        .spawn()
}

pub fn start_in(
    dir: &Path,
    project_path: &str,
    cwd: &Path,
    args: &[String],
    on_exit: impl FnOnce() + Send + 'static,
) -> Result<DevServer, String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let slug = slug(project_path);
    if Job::open(&slug).is_some_and(|j| !j.pids().is_empty()) {
        return Err("dev server is already running".into());
    }
    let line = args.join(" ");
    let log = File::create(dir.join(format!("{slug}.log"))).map_err(|e| e.to_string())?;
    let job = Job::create(&slug)?;
    let mut child = match spawn(cwd, &line, &log, true) {
        Err(e) if e.raw_os_error() == Some(ERROR_ACCESS_DENIED) => spawn(cwd, &line, &log, false),
        other => other,
    }
    .map_err(|e| format!("failed to start `{line}`: {e}"))?;
    if let Err(e) = job.assign(&child) {
        let _ = child.kill();
        return Err(e);
    }
    let file = DevFile {
        project_path: project_path.to_owned(),
        command: line,
        pid: child.id(),
        started_at: now_ms(),
        seen: start_times(&[child.id()]),
        exit_code: None,
        stopped: false,
    };
    if let Err(e) = write_file(dir, &slug, &file) {
        job.terminate();
        let _ = child.kill();
        return Err(e);
    }
    runtime().insert(slug.clone(), Runtime::default());
    let watched = slug.clone();
    let state = dir.to_path_buf();
    std::thread::spawn(move || {
        let _job = job;
        let code = child.wait().ok().and_then(|s| s.code());
        let stopping = runtime().entry(watched.clone()).or_default().stopping;
        if !stopping {
            let _ = update_file(&state, &watched, |f| f.exit_code = code);
        }
        on_exit();
    });
    Ok(server(dir, &slug, file, &listeners(), now_ms()))
}

pub fn start(
    project_path: &str,
    on_exit: impl FnOnce() + Send + 'static,
) -> Result<DevServer, String> {
    let project = super::projects::ensure_project(project_path)?;
    let cwd = PathBuf::from(&project.path);
    let (args, _) = super::projects::dev_args(&cwd).ok_or("project has no dev command")?;
    let dir = state_dir().ok_or("cannot resolve state dir")?;
    start_in(&dir, &project.path, &cwd, &args, on_exit)
}

fn chain<'a>(table: &'a HashMap<u32, Proc>, pid: u32) -> impl Iterator<Item = &'a Proc> + 'a {
    let mut visited = HashSet::new();
    let mut cur = table.get(&pid);
    std::iter::from_fn(move || {
        let child = cur?;
        let p = table
            .get(&child.ppid)
            .filter(|p| p.start_time <= child.start_time)?;
        if !visited.insert(p.pid) {
            return None;
        }
        cur = Some(p);
        Some(p)
    })
}

pub fn leftovers(
    table: &HashMap<u32, Proc>,
    started_at: u64,
    seen: &HashSet<(u32, u64)>,
) -> Vec<(u32, u64)> {
    let since = started_at.saturating_sub(SWEEP_SLACK_MS);
    let is_claude = |p: &Proc| p.name.eq_ignore_ascii_case("claude.exe");
    let is_seen = |p: &Proc| seen.contains(&(p.pid, p.start_time));
    table
        .values()
        .filter(|p| p.start_time >= since && !is_claude(p))
        .filter(|p| {
            is_seen(p)
                || chain(table, p.pid)
                    .find(|a| is_claude(a) || is_seen(a))
                    .is_some_and(is_seen)
        })
        .map(|p| (p.pid, p.start_time))
        .collect()
}

fn start_times(pids: &[u32]) -> Vec<(u32, u64)> {
    let mut sys = sysinfo::System::new();
    let list: Vec<sysinfo::Pid> = pids.iter().map(|p| sysinfo::Pid::from_u32(*p)).collect();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&list), true);
    pids.iter()
        .filter_map(|pid| {
            sys.process(sysinfo::Pid::from_u32(*pid))
                .map(|p| (*pid, p.start_time() * 1000))
        })
        .collect()
}

fn kill_exact(targets: &[(u32, u64)]) {
    if targets.is_empty() {
        return;
    }
    let mut sys = sysinfo::System::new();
    let pids: Vec<sysinfo::Pid> = targets
        .iter()
        .map(|(p, _)| sysinfo::Pid::from_u32(*p))
        .collect();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&pids), true);
    for (pid, start) in targets {
        if let Some(p) = sys.process(sysinfo::Pid::from_u32(*pid)) {
            if p.start_time() * 1000 == *start {
                p.kill();
            }
        }
    }
}

pub fn stop_in(dir: &Path, project_path: &str) -> Result<(), String> {
    let slug = slug(project_path);
    let file = read_file(dir, &slug).ok_or("dev server was never started")?;
    runtime().entry(slug.clone()).or_default().stopping = true;
    let job = Job::open(&slug);
    let live = job.as_ref().map(Job::pids).unwrap_or_default();
    if let Some(job) = job.filter(|_| !live.is_empty()) {
        let table = processes::table();
        let mut seen: HashSet<(u32, u64)> = file.seen.iter().copied().collect();
        seen.extend(
            live.iter()
                .filter_map(|pid| table.get(pid).map(|p| (p.pid, p.start_time))),
        );
        if !job.terminate() {
            return Err(format!(
                "TerminateJobObject: {}",
                std::io::Error::last_os_error()
            ));
        }
        kill_exact(&leftovers(&table, file.started_at, &seen));
    }
    update_file(dir, &slug, |f| {
        f.stopped = true;
        f.exit_code = None;
    })
}

pub fn stop(project_path: &str) -> Result<(), String> {
    let project = super::projects::ensure_project(project_path)?;
    let dir = state_dir().ok_or("cannot resolve state dir")?;
    stop_in(&dir, &project.path)
}

pub fn port_from_log(text: &str, ports: &[u16]) -> Option<u16> {
    ["localhost:", "127.0.0.1:", "[::1]:"]
        .iter()
        .flat_map(|host| text.match_indices(host).map(move |(i, _)| i + host.len()))
        .filter_map(|start| {
            let digits: String = text[start..]
                .chars()
                .take_while(char::is_ascii_digit)
                .collect();
            digits.parse::<u16>().ok()
        })
        .find(|p| ports.contains(p))
}

pub fn first_port(project_path: &str) -> Option<u16> {
    let slug = slug(project_path);
    let server = list()
        .into_iter()
        .find(|s| slug == self::slug(&s.project_path))?;
    let log = fs::read(&server.log).ok().map(|bytes| {
        let from = bytes.len().saturating_sub(LOG_PORT_SCAN as usize);
        String::from_utf8_lossy(&bytes[from..]).into_owned()
    });
    log.and_then(|text| port_from_log(&text, &server.ports))
        .or_else(|| server.ports.first().copied())
}

pub fn read_new(path: &Path, pos: u64) -> std::io::Result<(Vec<u8>, u64)> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    let from = if len < pos { 0 } else { pos };
    file.seek(SeekFrom::Start(from))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)?;
    let next = from + buf.len() as u64;
    Ok((buf, next))
}

pub fn tail(project_path: &str, channel: Channel<Vec<u8>>) -> Result<u32, String> {
    let dir = state_dir().ok_or("cannot resolve state dir")?;
    let path = dir.join(format!("{}.log", slug(project_path)));
    let id = NEXT_TAIL.fetch_add(1, Ordering::Relaxed);
    let alive = Arc::new(AtomicBool::new(true));
    TAILS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id, alive.clone());
    std::thread::spawn(move || {
        let mut pos = fs::metadata(&path)
            .map(|m| m.len().saturating_sub(TAIL_MAX))
            .unwrap_or(0);
        let mut align = pos > 0;
        let mut idle = 0u32;
        while alive.load(Ordering::Relaxed) {
            if let Ok((mut bytes, next)) = read_new(&path, pos) {
                pos = next;
                if align && !bytes.is_empty() {
                    align = false;
                    let cut = bytes.iter().position(|b| *b == b'\n').map_or(0, |i| i + 1);
                    bytes.drain(..cut);
                }
                idle = if bytes.is_empty() { idle + 1 } else { 0 };
                let heartbeat = idle >= HEARTBEAT_TICKS;
                if (!bytes.is_empty() || heartbeat) && channel.send(bytes).is_err() {
                    break;
                }
                if heartbeat {
                    idle = 0;
                }
            }
            std::thread::sleep(TAIL_POLL);
        }
        TAILS.lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
    });
    Ok(id)
}

pub fn untail(id: u32) {
    if let Some(alive) = TAILS.lock().unwrap_or_else(|e| e.into_inner()).remove(&id) {
        alive.store(false, Ordering::Relaxed);
    }
}

pub fn start_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Vec<(String, DevState, Vec<u16>)> = Vec::new();
        loop {
            let servers = list();
            let now: Vec<_> = servers
                .iter()
                .map(|s| (s.project_path.clone(), s.state, s.ports.clone()))
                .collect();
            if now != last {
                let _ = app.emit(EVENT_DEV, ());
                last = now;
            }
            let fast = servers.iter().any(|s| s.state == DevState::Starting);
            std::thread::sleep(if fast { FAST_POLL } else { SLOW_POLL });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_ignores_case_and_slashes() {
        assert_eq!(
            slug(r"C:\Users\Me\Projects\AM 2.0"),
            slug("c:/users/me/projects/am 2.0/")
        );
        assert_ne!(slug(r"C:\P\A"), slug(r"C:\P\B"));
        assert_eq!(slug(r"C:\P\A").len(), 16);
    }

    #[test]
    fn ports_for_picks_job_pids_sorted_unique() {
        let table = [(10, 5173), (11, 1420), (10, 5173), (99, 3000), (11, 9222)];
        assert_eq!(ports_for(&[10, 11], &table), vec![1420, 5173, 9222]);
        assert!(ports_for(&[], &table).is_empty());
    }

    #[test]
    fn port_bytes_are_network_order() {
        assert_eq!(port_of(u32::from(5173u16.to_be())), 5173);
    }

    #[test]
    fn read_new_follows_growth_and_truncation() {
        let path = std::env::temp_dir().join("echo-dev-read-new.log");
        fs::write(&path, b"abc").unwrap();
        let (a, pos) = read_new(&path, 0).unwrap();
        assert_eq!((a.as_slice(), pos), (&b"abc"[..], 3));
        fs::write(&path, b"abcdef").unwrap();
        let (b, pos) = read_new(&path, pos).unwrap();
        assert_eq!((b.as_slice(), pos), (&b"def"[..], 6));
        fs::write(&path, b"xy").unwrap();
        let (c, pos) = read_new(&path, pos).unwrap();
        assert_eq!((c.as_slice(), pos), (&b"xy"[..], 2));
    }

    #[test]
    fn listeners_find_own_ports_v4_and_v6() {
        let v4 = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let v6 = std::net::TcpListener::bind("[::1]:0").unwrap();
        let me = std::process::id();
        let ports = ports_for(&[me], &listeners());
        assert!(
            ports.contains(&v4.local_addr().unwrap().port()),
            "{ports:?}"
        );
        assert!(
            ports.contains(&v6.local_addr().unwrap().port()),
            "{ports:?}"
        );
    }

    #[test]
    fn named_job_outlives_its_handle() {
        let slug = format!("test-{}", std::process::id());
        let job = Job::create(&slug).unwrap();
        let mut child = super::super::child_command("ping")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        job.assign(&child).unwrap();
        drop(job);
        let reopened = Job::open(&slug).expect("job reachable by name after its handle closed");
        assert_eq!(reopened.pids(), vec![child.id()]);
        assert!(reopened.terminate());
        let _ = child.wait();
        assert!(reopened.pids().is_empty());
    }

    #[test]
    fn start_list_stop_whole_tree() {
        let base = std::env::temp_dir().join(format!("echo-dev-test-{}", std::process::id()));
        let project = base.join("project");
        let dir = base.join("state");
        fs::create_dir_all(&project).unwrap();
        let project_path = project.to_string_lossy().into_owned();
        let args = ["ping -n 30 127.0.0.1 > nul & ping -n 30 127.0.0.1".to_owned()];
        let started = start_in(&dir, &project_path, &project, &args, || {}).unwrap();
        assert_eq!(started.state, DevState::Starting);
        assert!(start_in(&dir, &project_path, &project, &args, || {}).is_err());
        std::thread::sleep(Duration::from_millis(500));
        let listed = list_in(&dir);
        assert_eq!(listed.len(), 1);
        assert!(!listed[0].pids.is_empty());
        stop_in(&dir, &project_path).unwrap();
        std::thread::sleep(Duration::from_millis(500));
        let after = list_in(&dir);
        assert_eq!(after[0].state, DevState::Stopped);
        assert!(after[0].pids.is_empty());
        stop_in(&dir, &project_path).unwrap();
        assert!(read_file(&dir, &slug(&project_path)).is_some_and(|f| f.stopped));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn crash_is_kept_in_the_state_file() {
        let base = std::env::temp_dir().join(format!("echo-dev-crash-{}", std::process::id()));
        let project = base.join("project");
        let dir = base.join("state");
        fs::create_dir_all(&project).unwrap();
        let project_path = project.to_string_lossy().into_owned();
        let (tx, rx) = std::sync::mpsc::channel();
        start_in(
            &dir,
            &project_path,
            &project,
            &["exit 3".to_owned()],
            move || {
                let _ = tx.send(());
            },
        )
        .unwrap();
        rx.recv_timeout(Duration::from_secs(10)).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let mut listed = list_in(&dir);
        while !listed[0].pids.is_empty() && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
            listed = list_in(&dir);
        }
        assert_eq!(listed[0].state, DevState::Error);
        assert_eq!(listed[0].exit_code, Some(3));
        let _ = fs::remove_dir_all(&base);
    }

    fn p(pid: u32, ppid: u32, name: &str, cwd: &str, start: u64) -> Proc {
        Proc {
            pid,
            ppid,
            name: name.into(),
            cwd: Some(cwd.into()),
            start_time: start,
            ..Proc::default()
        }
    }

    const PROJECT: &str = r"C:\P\Breeze";

    fn swept(procs: Vec<Proc>, seen: &[(u32, u64)]) -> Vec<u32> {
        let table: HashMap<u32, Proc> = procs.into_iter().map(|p| (p.pid, p)).collect();
        let seen: HashSet<(u32, u64)> = seen.iter().copied().collect();
        let mut got: Vec<u32> = leftovers(&table, 5_000, &seen)
            .into_iter()
            .map(|(pid, _)| pid)
            .collect();
        got.sort_unstable();
        got
    }

    #[test]
    fn leftovers_skip_a_reused_seen_pid() {
        let procs = vec![
            p(100, 1, "chrome.exe", r"C:\Users\me", 9_000),
            p(101, 100, "chrome.exe", r"C:\Users\me", 9_100),
            p(300, 100, "node.exe", PROJECT, 5_000),
        ];
        assert!(swept(procs, &[(100, 5_000)]).is_empty());
    }

    #[test]
    fn leftovers_leave_orphans_in_the_project_alone() {
        let procs = vec![
            p(201, 900, "node.exe", PROJECT, 6_000),
            p(202, 201, "esbuild.exe", PROJECT, 6_100),
            p(203, 10, "cargo.exe", PROJECT, 7_000),
        ];
        assert!(swept(procs, &[(100, 5_000)]).is_empty());
    }

    #[test]
    fn leftovers_follow_the_snapshot_chain_out_of_the_job() {
        let procs = vec![
            p(5, 1, "claude.exe", r"C:\Users\me", 1),
            p(6, 5, "echo-studio.exe", r"C:\Users\me", 2),
            p(100, 6, "cmd.exe", PROJECT, 5_000),
            p(101, 100, "node.exe", PROJECT, 5_100),
            p(102, 101, "esbuild.exe", r"C:\Temp", 5_200),
            p(103, 102, "node.exe", PROJECT, 5_300),
            p(104, 101, "claude.exe", PROJECT, 8_000),
            p(105, 104, "node.exe", PROJECT, 8_100),
        ];
        assert_eq!(swept(procs, &[(100, 5_000)]), vec![100, 101, 102, 103]);
    }

    #[test]
    fn old_state_file_without_start_times_still_reads() {
        let file: DevFile = serde_json::from_str(
            r#"{"projectPath":"C:\\P","command":"pnpm dev","pid":7,"startedAt":1,"seenPids":[7,8]}"#,
        )
        .unwrap();
        assert!(file.seen.is_empty());
    }

    #[test]
    fn port_from_log_prefers_the_printed_url() {
        let log = "VITE ready\n  ➜  Local:   http://localhost:1420/\n  ➜  Network: use --host";
        assert_eq!(port_from_log(log, &[1420, 9222]), Some(1420));
        assert_eq!(
            port_from_log("listening on 127.0.0.1:3001", &[3000, 3001]),
            Some(3001)
        );
        assert_eq!(port_from_log("http://localhost:5173", &[1420]), None);
    }
}
