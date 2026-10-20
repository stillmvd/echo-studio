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

use super::processes::{self, Guard};
use super::projects::is_within;

pub const EVENT_DEV: &str = "workbench://dev";
const JOB_OBJECT_QUERY: u32 = 0x0004;
const JOB_OBJECT_TERMINATE: u32 = 0x0008;
const ERROR_ACCESS_DENIED: i32 = 5;
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
    exit_code: Option<i32>,
}

static RUNTIME: LazyLock<Mutex<HashMap<String, Runtime>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static TAILS: LazyLock<Mutex<HashMap<u32, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_TAIL: AtomicU32 = AtomicU32::new(1);

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
    let mut buf = vec![0u8; size as usize + 1024];
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
    if rc != 0 {
        return Vec::new();
    }
    buf
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

fn server(dir: &Path, slug: &str, file: DevFile, table: &[(u32, u16)], now: u64) -> DevServer {
    let pids = Job::open(slug).map(|j| j.pids()).unwrap_or_default();
    let ports = ports_for(&pids, table);
    let exit_code = runtime().get(slug).and_then(|r| r.exit_code);
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
    };
    write_file(dir, &slug, &file)?;
    runtime().insert(slug.clone(), Runtime::default());
    let watched = slug.clone();
    std::thread::spawn(move || {
        let job = job;
        let code = child.wait().ok().and_then(|s| s.code());
        let mut rt = runtime();
        let entry = rt.entry(watched).or_default();
        if !entry.stopping && job.pids().is_empty() {
            entry.exit_code = code;
        }
        drop(rt);
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

fn leftovers(project_path: &str, started_at: u64, root: &Path) -> Vec<u32> {
    let root = root.to_string_lossy();
    let snap = processes::snapshot(Vec::new(), Vec::new(), &root);
    let projects = [processes::ProjectRef {
        path: project_path.to_owned(),
        profile: None,
    }];
    let classes = processes::classify(&snap, &projects, &root);
    let needle = project_path.to_lowercase();
    snap.processes
        .iter()
        .filter(|p| p.start_time >= started_at)
        .filter(|p| !p.name.eq_ignore_ascii_case("claude.exe"))
        .filter(|p| {
            p.cwd.as_deref().is_some_and(|c| is_within(c, project_path))
                || p.cmd
                    .as_deref()
                    .is_some_and(|c| c.to_lowercase().contains(&needle))
        })
        .filter(|p| {
            classes.get(&p.pid).is_some_and(|c| {
                c.session.is_none()
                    && c.guard != Some(Guard::LiveSession)
                    && c.rule != "editor-tool"
                    && c.ignore.is_none()
            })
        })
        .map(|p| p.pid)
        .collect()
}

pub fn stop_in(dir: &Path, project_path: &str, root: &Path) -> Result<(), String> {
    let slug = slug(project_path);
    let file = read_file(dir, &slug).ok_or("dev server was never started")?;
    runtime().entry(slug.clone()).or_default().stopping = true;
    if let Some(job) = Job::open(&slug) {
        if !job.pids().is_empty() && !job.terminate() {
            return Err(format!(
                "TerminateJobObject: {}",
                std::io::Error::last_os_error()
            ));
        }
    }
    let rest = leftovers(&file.project_path, file.started_at, root);
    if !rest.is_empty() {
        let mut sys = sysinfo::System::new();
        let pids: Vec<sysinfo::Pid> = rest.iter().map(|p| sysinfo::Pid::from_u32(*p)).collect();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&pids), true);
        for pid in pids {
            if let Some(p) = sys.process(pid) {
                p.kill();
            }
        }
    }
    let mut rt = runtime();
    let entry = rt.entry(slug).or_default();
    entry.exit_code = None;
    Ok(())
}

pub fn stop(project_path: &str) -> Result<(), String> {
    let project = super::projects::ensure_project(project_path)?;
    let dir = state_dir().ok_or("cannot resolve state dir")?;
    let root = super::projects_root().ok_or("cannot resolve Projects root")?;
    stop_in(&dir, &project.path, &root)
}

pub fn first_port(project_path: &str) -> Option<u16> {
    let slug = slug(project_path);
    list()
        .into_iter()
        .find(|s| slug == self::slug(&s.project_path))
        .and_then(|s| s.ports.first().copied())
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
        while alive.load(Ordering::Relaxed) {
            if let Ok((bytes, next)) = read_new(&path, pos) {
                pos = next;
                if !bytes.is_empty() && channel.send(bytes).is_err() {
                    break;
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
        stop_in(&dir, &project_path, &base).unwrap();
        std::thread::sleep(Duration::from_millis(500));
        let after = list_in(&dir);
        assert_eq!(after[0].state, DevState::Stopped);
        assert!(after[0].pids.is_empty());
        let _ = fs::remove_dir_all(&base);
    }
}
