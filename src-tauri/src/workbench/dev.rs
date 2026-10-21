use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, LazyLock, Mutex, OnceLock};
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
const STOP_ROUNDS: usize = 3;
const STOP_SETTLE: Duration = Duration::from_millis(150);
const SWEEP_GUARDED: [&str; 8] = [
    "claude.exe",
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "code.exe",
    "explorer.exe",
    "windowsterminal.exe",
    "wt.exe",
];
const HEARTBEAT_TICKS: u32 = 25;
const LOG_PORT_SCAN: u64 = 64 * 1024;
const STARTING_FOR: u64 = 30_000;
const TAIL_MAX: u64 = 2 * 1024 * 1024;
const TAIL_POLL: Duration = Duration::from_millis(200);
const FAST_POLL: Duration = Duration::from_secs(2);
const SLOW_POLL: Duration = Duration::from_secs(10);
const RESTART_AFTER: u64 = 60_000;
const RESTART_MARK: &str = "--- dev упал (код";
const BUILD_FAILED: [&str; 6] = [
    "[vite] Internal server error",
    "Pre-transform error",
    "Failed to compile",
    "✘ [ERROR]",
    "error during build",
    "could not compile",
];
const BUILD_OK: [&str; 7] = [
    "hmr update",
    "page reload",
    "ready in",
    "built in",
    "ompiled successfully",
    "Finished `",
    "Compiled with warnings",
];
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
    #[serde(default)]
    restarted: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BuildErrors {
    pub count: u32,
    pub at: Option<String>,
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
    pub pids: Vec<u32>,
    pub errors: Option<BuildErrors>,
    pub restarted: bool,
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

const MAIN_ID: &str = "com.stillmvd.echo-studio";
static APP_ID: OnceLock<String> = OnceLock::new();

pub fn set_app_id(identifier: &str) {
    let _ = APP_ID.set(identifier.to_owned());
}

fn app_id() -> &'static str {
    APP_ID.get().map_or(MAIN_ID, String::as_str)
}

pub fn state_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join(app_id()).join("workbench").join("dev"))
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
    job_name_in(app_id(), slug)
        .encode_utf16()
        .chain(Some(0))
        .collect()
}

fn job_name_in(identifier: &str, slug: &str) -> String {
    if identifier == MAIN_ID {
        format!("Local\\EchoStudio.dev.{slug}")
    } else {
        format!("Local\\EchoStudio.dev.{identifier}.{slug}")
    }
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

fn tcp_table(family: u16) -> Option<Vec<u8>> {
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
            0 => return Some(buf),
            ERROR_INSUFFICIENT_BUFFER => continue,
            _ => return None,
        }
    }
    None
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

pub fn read_listeners() -> Option<Vec<(u32, u16)>> {
    let v4 = rows_of::<MIB_TCPROW_OWNER_PID>(&tcp_table(AF_INET)?)
        .into_iter()
        .map(|r| (r.dwOwningPid, port_of(r.dwLocalPort)));
    let v6 = rows_of::<MIB_TCP6ROW_OWNER_PID>(&tcp_table(AF_INET6)?)
        .into_iter()
        .map(|r| (r.dwOwningPid, port_of(r.dwLocalPort)));
    Some(v4.chain(v6).collect())
}

pub fn listeners() -> Vec<(u32, u16)> {
    read_listeners().unwrap_or_default()
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

fn files() -> std::sync::MutexGuard<'static, ()> {
    FILES.lock().unwrap_or_else(|e| e.into_inner())
}

fn update_file(dir: &Path, slug: &str, change: impl FnOnce(&mut DevFile)) -> Result<(), String> {
    let _lock = files();
    let mut file = read_file(dir, slug).ok_or("dev server was never started")?;
    change(&mut file);
    write_file(dir, slug, &file)
}

fn server(dir: &Path, slug: &str, file: DevFile, table: &[(u32, u16)], now: u64) -> DevServer {
    let pids = running_members(slug, file.started_at);
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
        (_, Some(code)) if code != 0 && ports.is_empty() => DevState::Error,
        (false, _) if ports.is_empty() && now.saturating_sub(file.started_at) < STARTING_FOR => {
            DevState::Starting
        }
        (false, _) => DevState::Running,
        (true, _) => DevState::Stopped,
    };
    let log = dir.join(format!("{slug}.log"));
    let errors = matches!(state, DevState::Starting | DevState::Running)
        .then(|| log_tail(&log))
        .flatten()
        .and_then(|text| build_errors(&text, &file.project_path));
    DevServer {
        project_path: file.project_path,
        command: file.command,
        state,
        ports,
        started_at: file.started_at,
        exit_code,
        log: log.to_string_lossy().into_owned(),
        pids,
        errors,
        restarted: file.restarted,
    }
}

fn log_tail(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(LOG_PORT_SCAN)))
        .ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('[') => {
                for c in chars.by_ref() {
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
            }
            Some(']') => {
                while let Some(c) = chars.next() {
                    if c == '\u{7}' || (c == '\u{1b}' && chars.next_if_eq(&'\\').is_some()) {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

fn without_root(line: &str, project: &str) -> String {
    let line = line.replace('\\', "/");
    let root = format!("{}/", project.replace('\\', "/").trim_end_matches('/'));
    let (lower, low_root) = (line.to_lowercase(), root.to_lowercase());
    match lower.find(&low_root) {
        Some(i) if lower.len() == line.len() && low_root.len() == root.len() => {
            format!("{}{}", &line[..i], &line[i + root.len()..])
        }
        _ => line,
    }
}

fn location(line: &str, project: &str) -> Option<String> {
    without_root(line, project)
        .split_whitespace()
        .find_map(|raw| {
            let token = raw.trim_matches(|c: char| "\"'`,;[]".contains(c));
            let (cut, _) = token.char_indices().find(|&(i, c)| {
                (c == ':' || c == '(')
                    && i > 0
                    && token[i + 1..].starts_with(|d: char| d.is_ascii_digit())
            })?;
            let path = &token[..cut];
            let name = path.rsplit('/').next().unwrap_or(path);
            let (stem, ext) = name.rsplit_once('.')?;
            if stem.is_empty()
                || !ext.starts_with(|c: char| c.is_ascii_alphabetic())
                || !ext.chars().all(|c| c.is_ascii_alphanumeric())
            {
                return None;
            }
            let line_no: String = token[cut + 1..]
                .chars()
                .take_while(char::is_ascii_digit)
                .collect();
            Some(format!("{}:{line_no}", path.trim_start_matches('/')))
        })
}

fn number_before(text: &str, word: &str) -> Option<u32> {
    let end = text.find(word)?;
    let digits: String = text[..end]
        .trim_end()
        .chars()
        .rev()
        .take_while(char::is_ascii_digit)
        .collect();
    digits.chars().rev().collect::<String>().parse().ok()
}

fn checker_name(line: &str, found: usize) -> Option<String> {
    let named = line[..found]
        .trim_end()
        .strip_suffix(']')
        .and_then(|head| head.rsplit_once('['))
        .map(|(_, name)| name)
        .filter(|name| !name.starts_with(|c: char| c.is_ascii_digit()));
    match named {
        Some(name) => Some(name.to_owned()),
        None => line
            .contains("Watching for file changes")
            .then(|| "tsc".to_owned()),
    }
}

pub fn build_errors(text: &str, project: &str) -> Option<BuildErrors> {
    let text = strip_ansi(text);
    let text = text.rsplit(RESTART_MARK).next().unwrap_or_default();
    let mut checkers: Vec<(String, u32, Option<String>)> = Vec::new();
    let mut bundler: Option<(u32, Option<String>)> = None;
    let mut pending: Option<String> = None;
    for line in text.lines() {
        let trimmed = line.trim();
        let summary = line.find("Found ").and_then(|found| {
            let count = number_before(&line[found..], " error")?;
            Some((checker_name(line, found)?, count))
        });
        if let Some((name, count)) = summary {
            let at = if count > 0 { pending.take() } else { None };
            checkers.retain(|(n, ..)| *n != name);
            checkers.push((name, count, at));
            pending = None;
            continue;
        }
        if BUILD_OK.iter().any(|m| line.contains(m)) {
            bundler = None;
            continue;
        }
        if let Some(marker) = BUILD_FAILED.iter().find(|m| line.contains(*m)) {
            let count = number_before(line, " previous error")
                .or_else(|| number_before(line, " error"))
                .filter(|_| *marker == "could not compile" || *marker == "Failed to compile")
                .unwrap_or(1)
                .max(1);
            let at = location(line, project).or_else(|| pending.take());
            bundler = Some((count, at));
            continue;
        }
        let pointer = trimmed.starts_with("FILE ")
            || trimmed.starts_with("File:")
            || trimmed.starts_with("--> ")
            || line.contains("error TS");
        if !pointer {
            continue;
        }
        let Some(at) = location(trimmed, project) else {
            continue;
        };
        match &mut bundler {
            Some((_, slot @ None)) if !line.contains("error TS") => *slot = Some(at),
            _ => {
                pending.get_or_insert(at);
            }
        }
    }
    let count =
        checkers.iter().map(|(_, n, _)| n).sum::<u32>() + bundler.as_ref().map_or(0, |b| b.0);
    let at = bundler
        .and_then(|b| b.1)
        .or_else(|| checkers.into_iter().find(|c| c.1 > 0).and_then(|c| c.2));
    (count > 0).then_some(BuildErrors { count, at })
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

type OnExit = Arc<dyn Fn() + Send + Sync>;

pub fn start_in(
    dir: &Path,
    project_path: &str,
    cwd: &Path,
    args: &[String],
    on_exit: impl Fn() + Send + Sync + 'static,
) -> Result<DevServer, String> {
    launch(
        dir,
        project_path,
        cwd,
        args,
        Arc::new(on_exit),
        None,
        RESTART_AFTER,
    )
}

fn restart_due(code: Option<i32>, file: &DevFile, now: u64, after: u64) -> bool {
    code.is_some_and(|c| c != 0) && !file.restarted && now.saturating_sub(file.started_at) >= after
}

fn open_log(path: &Path, after_crash: Option<i32>) -> std::io::Result<File> {
    let Some(code) = after_crash else {
        return File::create(path);
    };
    let mut log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    writeln!(
        log,
        "\n{RESTART_MARK} {code}), Echo запускает его снова ---\n"
    )?;
    Ok(log)
}

fn launch(
    dir: &Path,
    project_path: &str,
    cwd: &Path,
    args: &[String],
    on_exit: OnExit,
    after_crash: Option<i32>,
    restart_after: u64,
) -> Result<DevServer, String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let slug = slug(project_path);
    let previous = read_file(dir, &slug);
    let started_at = previous.as_ref().map_or(0, |f| f.started_at);
    let members = running_members(&slug, started_at);
    if !members.is_empty() {
        let failed = previous
            .and_then(|f| f.exit_code)
            .is_some_and(|code| code != 0);
        if !failed || !ports_for(&members, &listeners()).is_empty() {
            return Err("dev server is already running".into());
        }
        stop_in(dir, project_path)?;
    }
    let line = args.join(" ");
    let log = open_log(&dir.join(format!("{slug}.log")), after_crash).map_err(|e| e.to_string())?;
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
        restarted: after_crash.is_some(),
    };
    let written = {
        let _lock = files();
        write_file(dir, &slug, &file)
    };
    if let Err(e) = written {
        job.terminate();
        let _ = child.kill();
        return Err(e);
    }
    {
        let mut rt = runtime();
        if after_crash.is_some() && rt.get(&slug).is_some_and(|r| r.stopping) {
            drop(rt);
            job.terminate();
            let _ = child.kill();
            return Err("dev server was stopped during the restart".into());
        }
        rt.insert(slug.clone(), Runtime::default());
    }
    let watched = slug.clone();
    let state = dir.to_path_buf();
    let (project, cwd, args) = (project_path.to_owned(), cwd.to_path_buf(), args.to_vec());
    std::thread::spawn(move || {
        let _job = job;
        let code = child.wait().ok().and_then(|s| s.code());
        let stopping = runtime().entry(watched.clone()).or_default().stopping;
        if !stopping {
            let _ = update_file(&state, &watched, |f| f.exit_code = code);
            let again = read_file(&state, &watched).is_some_and(|f| {
                restart_due(code, &f, now_ms(), restart_after)
                    && ports_for(&running_members(&watched, f.started_at), &listeners()).is_empty()
            });
            if again && !runtime().entry(watched.clone()).or_default().stopping {
                let _ = launch(
                    &state,
                    &project,
                    &cwd,
                    &args,
                    on_exit.clone(),
                    code,
                    restart_after,
                );
            }
        }
        on_exit();
    });
    Ok(server(dir, &slug, file, &listeners(), now_ms()))
}

pub fn start(
    project_path: &str,
    on_exit: impl Fn() + Send + Sync + 'static,
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

fn guarded(p: &Proc) -> bool {
    SWEEP_GUARDED.iter().any(|n| p.name.eq_ignore_ascii_case(n))
}

pub fn unguarded(table: &HashMap<u32, Proc>, started_at: u64, members: &[u32]) -> Vec<u32> {
    let since = started_at.saturating_sub(SWEEP_SLACK_MS);
    members
        .iter()
        .filter_map(|pid| table.get(pid))
        .filter(|p| {
            !guarded(p)
                && !chain(table, p.pid)
                    .take_while(|a| a.start_time >= since || members.contains(&a.pid))
                    .any(guarded)
        })
        .map(|p| p.pid)
        .collect()
}

fn member_table(pids: &[u32]) -> HashMap<u32, Proc> {
    if pids.is_empty() {
        return HashMap::new();
    }
    let mut sys = sysinfo::System::new();
    let list: Vec<sysinfo::Pid> = pids.iter().map(|p| sysinfo::Pid::from_u32(*p)).collect();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&list), true);
    pids.iter()
        .filter_map(|pid| {
            let p = sys.process(sysinfo::Pid::from_u32(*pid))?;
            Some((
                *pid,
                Proc {
                    pid: *pid,
                    ppid: p.parent().map(sysinfo::Pid::as_u32).unwrap_or(0),
                    name: p.name().to_string_lossy().into_owned(),
                    start_time: p.start_time() * 1000,
                    ..Proc::default()
                },
            ))
        })
        .collect()
}

fn running_members(slug: &str, started_at: u64) -> Vec<u32> {
    let pids = Job::open(slug).map(|j| j.pids()).unwrap_or_default();
    unguarded(&member_table(&pids), started_at, &pids)
}

pub fn leftovers(
    table: &HashMap<u32, Proc>,
    started_at: u64,
    seen: &HashSet<(u32, u64)>,
) -> Vec<(u32, u64)> {
    let since = started_at.saturating_sub(SWEEP_SLACK_MS);
    let is_seen = |p: &Proc| seen.contains(&(p.pid, p.start_time));
    table
        .values()
        .filter(|p| p.start_time >= since && !guarded(p))
        .filter(|p| {
            !chain(table, p.pid)
                .take_while(|a| a.start_time >= since)
                .any(guarded)
        })
        .filter(|p| {
            is_seen(p)
                || chain(table, p.pid)
                    .find(|a| guarded(a) || is_seen(a))
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

struct StopPlan {
    targets: Vec<(u32, u64)>,
    free: usize,
    shielded: bool,
}

fn plan_stop(
    table: &HashMap<u32, Proc>,
    started_at: u64,
    live: &[u32],
    seen: &mut HashSet<(u32, u64)>,
) -> StopPlan {
    let members: Vec<(u32, u64)> = live
        .iter()
        .filter_map(|pid| table.get(pid).map(|p| (p.pid, p.start_time)))
        .collect();
    seen.extend(members.iter().copied());
    let free = unguarded(table, started_at, live);
    let mut targets = leftovers(table, started_at, seen);
    for pid in &free {
        if let Some(p) = table.get(pid) {
            if !targets.contains(&(p.pid, p.start_time)) {
                targets.push((p.pid, p.start_time));
            }
        }
    }
    StopPlan {
        targets,
        free: free.len(),
        shielded: free.len() < members.len(),
    }
}

pub fn stop_in(dir: &Path, project_path: &str) -> Result<(), String> {
    let slug = slug(project_path);
    let file = read_file(dir, &slug).ok_or("dev server was never started")?;
    runtime().entry(slug.clone()).or_default().stopping = true;
    if let Some(job) = Job::open(&slug) {
        let mut seen: HashSet<(u32, u64)> = file.seen.iter().copied().collect();
        let fail = |seen: &HashSet<(u32, u64)>, message: String| -> Result<(), String> {
            runtime().entry(slug.clone()).or_default().stopping = false;
            let _ = update_file(dir, &slug, |f| {
                for pair in seen {
                    if f.seen.len() < SEEN_MAX && !f.seen.contains(pair) {
                        f.seen.push(*pair);
                    }
                }
            });
            Err(message)
        };
        for round in 0..STOP_ROUNDS {
            let before = job.pids();
            let table = processes::table();
            let live: Vec<u32> = job
                .pids()
                .into_iter()
                .filter(|p| before.contains(p))
                .collect();
            let plan = plan_stop(&table, file.started_at, &live, &mut seen);
            if plan.targets.is_empty() {
                break;
            }
            if round == 0 && plan.free > 0 && !plan.shielded && !job.terminate() {
                let error = std::io::Error::last_os_error();
                return fail(&seen, format!("TerminateJobObject: {error}"));
            }
            kill_exact(&plan.targets);
            std::thread::sleep(STOP_SETTLE);
        }
        let live = job.pids();
        let members = member_table(&live);
        let left = unguarded(&members, file.started_at, &live);
        if !left.is_empty() {
            let names: Vec<String> = left
                .iter()
                .filter_map(|pid| members.get(pid).map(|p| p.name.clone()))
                .collect();
            return fail(
                &seen,
                format!("не все процессы dev остановлены: {}", names.join(", ")),
            );
        }
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
    log_tail(Path::new(&server.log))
        .and_then(|text| port_from_log(&text, &server.ports))
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
        type Seen = (String, DevState, Vec<u16>, Option<BuildErrors>, u64);
        let mut last: Vec<Seen> = Vec::new();
        loop {
            let servers = list();
            let now: Vec<Seen> = servers
                .iter()
                .map(|s| {
                    (
                        s.project_path.clone(),
                        s.state,
                        s.ports.clone(),
                        s.errors.clone(),
                        s.started_at,
                    )
                })
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
    fn stop_spares_a_browser_in_the_job_and_allows_a_new_start() {
        let base = std::env::temp_dir().join(format!("echo-dev-shield-{}", std::process::id()));
        let project = base.join("project");
        let dir = base.join("state");
        fs::create_dir_all(&project).unwrap();
        let chrome = base.join("chrome.exe");
        fs::copy(r"C:\Windows\System32\PING.EXE", &chrome).unwrap();
        let project_path = project.to_string_lossy().into_owned();
        let args = [format!(
            "start /b \"\" \"{}\" -n 30 127.0.0.1 > nul & ping -n 30 127.0.0.1 > nul",
            chrome.display()
        )];
        start_in(&dir, &project_path, &project, &args, || {}).unwrap();
        std::thread::sleep(Duration::from_millis(800));
        let fake = |table: &HashMap<u32, Proc>| {
            table
                .values()
                .find(|p| {
                    p.exe
                        .as_deref()
                        .is_some_and(|e| Path::new(e) == chrome.as_path())
                })
                .map(|p| p.pid)
        };
        let browser = fake(&processes::table()).expect("fake browser started");
        stop_in(&dir, &project_path).unwrap();
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(fake(&processes::table()), Some(browser));
        let after = list_in(&dir);
        assert_eq!(after[0].state, DevState::Stopped);
        assert!(after[0].pids.is_empty());
        stop_in(&dir, &project_path).unwrap();
        start_in(&dir, &project_path, &project, &["exit 0".to_owned()], || {}).unwrap();
        stop_in(&dir, &project_path).unwrap();
        kill_exact(
            &processes::table()
                .get(&browser)
                .map(|p| vec![(p.pid, p.start_time)])
                .unwrap_or_default(),
        );
        std::thread::sleep(Duration::from_millis(300));
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

    #[test]
    fn a_failed_root_with_a_listening_child_keeps_running_and_refuses_restart() {
        let base = std::env::temp_dir().join(format!("echo-dev-serving-{}", std::process::id()));
        let project = base.join("project");
        let dir = base.join("state");
        fs::create_dir_all(&project).unwrap();
        let project_path = project.to_string_lossy().into_owned();
        let (tx, rx) = std::sync::mpsc::channel();
        let args = ["ping -n 2 127.0.0.1 > nul & start /b node -e \"require('net').createServer().listen(0, '127.0.0.1')\" & exit 3".to_owned()];
        start_in(&dir, &project_path, &project, &args, move || {
            let _ = tx.send(());
        })
        .unwrap();
        rx.recv_timeout(Duration::from_secs(10)).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(10);
        let mut listed = list_in(&dir);
        while listed[0].ports.is_empty() && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
            listed = list_in(&dir);
        }
        assert_eq!(listed[0].state, DevState::Running, "{listed:?}");
        assert!(start_in(&dir, &project_path, &project, &["exit 0".to_owned()], || {}).is_err());
        assert!(!list_in(&dir)[0].ports.is_empty());
        stop_in(&dir, &project_path).unwrap();
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn a_failed_root_is_an_error_at_once_and_restart_clears_its_children() {
        let base = std::env::temp_dir().join(format!("echo-dev-failed-{}", std::process::id()));
        let project = base.join("project");
        let dir = base.join("state");
        fs::create_dir_all(&project).unwrap();
        let project_path = project.to_string_lossy().into_owned();
        let (tx, rx) = std::sync::mpsc::channel();
        let args = [
            "ping -n 2 127.0.0.1 > nul & start /b ping -n 30 127.0.0.1 > nul & exit 3".to_owned(),
        ];
        start_in(&dir, &project_path, &project, &args, move || {
            let _ = tx.send(());
        })
        .unwrap();
        rx.recv_timeout(Duration::from_secs(10)).unwrap();
        std::thread::sleep(Duration::from_millis(100));
        let listed = list_in(&dir);
        assert!(!listed[0].pids.is_empty());
        assert_eq!(listed[0].state, DevState::Error);
        let left = listed[0].pids.clone();
        start_in(&dir, &project_path, &project, &["exit 0".to_owned()], || {}).unwrap();
        let table = processes::table();
        assert!(left.iter().all(|pid| !table.contains_key(pid)), "{left:?}");
        stop_in(&dir, &project_path).unwrap();
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
    fn leftovers_spare_browsers_and_editors_opened_by_dev() {
        let procs = vec![
            p(100, 6, "cmd.exe", PROJECT, 5_000),
            p(101, 100, "node.exe", PROJECT, 5_100),
            p(110, 101, "chrome.exe", r"C:\Users\me", 5_200),
            p(111, 110, "chrome.exe", r"C:\Users\me", 5_300),
            p(120, 101, "Code.exe", PROJECT, 5_400),
            p(130, 101, "msedge.exe", r"C:\Users\me", 5_500),
        ];
        assert_eq!(swept(procs, &[(100, 5_000)]), vec![100, 101]);
    }

    #[test]
    fn a_browser_inside_the_job_shields_it_from_terminate() {
        let procs = vec![
            p(5, 1, "claude.exe", r"C:\Users\me", 1),
            p(6, 5, "echo-studio.exe", r"C:\Users\me", 2),
            p(100, 6, "cmd.exe", PROJECT, 5_000),
            p(101, 100, "node.exe", PROJECT, 5_100),
            p(110, 101, "chrome.exe", r"C:\Users\me", 5_200),
            p(111, 110, "chrome.exe", r"C:\Users\me", 5_300),
            p(112, 111, "crashpad.exe", r"C:\Users\me", 5_400),
        ];
        let table: HashMap<u32, Proc> = procs.iter().map(|p| (p.pid, p.clone())).collect();
        assert_eq!(
            unguarded(&table, 5_000, &[100, 101, 110, 111, 112]),
            vec![100, 101]
        );
        assert_eq!(unguarded(&table, 5_000, &[100, 101, 112]), vec![100, 101]);
        assert_eq!(unguarded(&table, 5_000, &[100, 101]), vec![100, 101]);
        let old = p(120, 101, "node.exe", PROJECT, 0);
        let mut with_old = table.clone();
        with_old.insert(120, old);
        assert_eq!(unguarded(&with_old, 5_000, &[100, 120]), vec![100, 120]);
        let seen = [
            (100, 5_000),
            (101, 5_100),
            (110, 5_200),
            (111, 5_300),
            (112, 5_400),
        ];
        assert_eq!(swept(procs, &seen), vec![100, 101]);
    }

    #[test]
    fn a_guarded_only_job_still_sweeps_seen_orphans() {
        let table: HashMap<u32, Proc> = [
            p(110, 6, "chrome.exe", r"C:\Users\me", 5_200),
            p(200, 9, "node.exe", PROJECT, 5_300),
            p(201, 200, "esbuild.exe", PROJECT, 5_400),
        ]
        .into_iter()
        .map(|p| (p.pid, p))
        .collect();
        let mut seen = HashSet::from([(100, 5_000), (200, 5_300)]);
        let plan = plan_stop(&table, 5_000, &[110], &mut seen);
        let mut got: Vec<u32> = plan.targets.iter().map(|(pid, _)| *pid).collect();
        got.sort_unstable();
        assert_eq!(got, vec![200, 201]);
        assert_eq!(plan.free, 0);
        assert!(plan.shielded);
        assert!(seen.contains(&(110, 5_200)));
    }

    #[test]
    fn leftovers_cut_a_link_to_a_younger_parent() {
        let procs = vec![
            p(100, 6, "cmd.exe", PROJECT, 6_000),
            p(200, 100, "node.exe", PROJECT, 5_500),
            p(201, 200, "node.exe", PROJECT, 5_600),
        ];
        assert_eq!(swept(procs, &[(100, 6_000)]), vec![100]);
    }

    #[test]
    fn leftovers_skip_processes_older_than_the_start_or_without_start_time() {
        let procs = vec![
            p(100, 6, "cmd.exe", PROJECT, 5_000),
            p(101, 100, "node.exe", PROJECT, 3_000),
            p(102, 100, "node.exe", PROJECT, 0),
            p(103, 100, "node.exe", PROJECT, 5_050),
        ];
        assert_eq!(
            swept(procs, &[(100, 5_000), (101, 3_000), (102, 0)]),
            vec![100, 103]
        );
    }

    #[test]
    fn seen_pairs_survive_a_round_trip() {
        let file = DevFile {
            project_path: r"C:\P".into(),
            command: "pnpm dev".into(),
            pid: 7,
            started_at: 1,
            seen: vec![(7, 1_000), (8, 2_000)],
            exit_code: Some(1),
            stopped: false,
            restarted: true,
        };
        let text = serde_json::to_string(&file).unwrap();
        assert!(text.contains(r#""seen":[[7,1000],[8,2000]]"#), "{text}");
        assert_eq!(serde_json::from_str::<DevFile>(&text).unwrap(), file);
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

    const BREEZE: &str = r"C:\Users\Me\Projects\Breeze";

    fn errors(log: &str) -> Option<(u32, Option<String>)> {
        build_errors(log, BREEZE).map(|e| (e.count, e.at))
    }

    #[test]
    fn vue_tsc_checker_errors_point_at_the_file_and_clear_on_zero() {
        let failed = "\u{1b}[31m ERROR(vue-tsc)\u{1b}[39m  Type 'x' is not assignable\n FILE  C:/Users/Me/Projects/Breeze/src/boot/i18n.ts:33:3\n\n    31 |   locale,\n  > 33 |   messages,\n\n[vue-tsc] Found 1 error. Watching for file changes.\n";
        assert_eq!(
            errors(failed),
            Some((1, Some("src/boot/i18n.ts:33".into())))
        );
        let fixed = format!("{failed}[vue-tsc] Found 0 errors. Watching for file changes.\n");
        assert_eq!(errors(&fixed), None);
        let eslint = format!("{failed}[ESLint] Found 0 error and 2 warning\n");
        assert_eq!(
            errors(&eslint),
            Some((1, Some("src/boot/i18n.ts:33".into())))
        );
    }

    #[test]
    fn tsc_watch_summaries_replace_each_other() {
        let log = "src/a.ts(4,7): error TS2322: no\nsrc/b.ts:9:1 - error TS1005: ';' expected\n[12:00:01 PM] Found 2 errors. Watching for file changes.\n";
        assert_eq!(errors(log), Some((2, Some("src/a.ts:4".into()))));
        let again = format!("{log}[12:00:09 PM] Found 0 errors. Watching for file changes.\n");
        assert_eq!(errors(&again), None);
    }

    #[test]
    fn vite_errors_clear_on_hmr_and_cargo_errors_on_finish() {
        let vite = "12:01:02 [vite] Internal server error: Failed to resolve import \"./x\" from \"src/App.vue\".\n  Plugin: vite:import-analysis\n  File: C:/Users/Me/Projects/Breeze/src/App.vue:3:20\n";
        assert_eq!(errors(vite), Some((1, Some("src/App.vue:3".into()))));
        assert_eq!(
            errors(&format!(
                "{vite}12:01:09 [vite] (client) hmr update /src/App.vue\n"
            )),
            None
        );
        let cargo = "error[E0425]: cannot find value `x`\n --> src\\lib.rs:3:5\nerror: could not compile `app` (lib) due to 2 previous errors\n";
        assert_eq!(errors(cargo), Some((2, Some("src/lib.rs:3".into()))));
        assert_eq!(
            errors(&format!("{cargo}    Finished `dev` profile in 3.1s\n")),
            None
        );
    }

    #[test]
    fn plain_output_has_no_build_errors() {
        let log = " App URL... http://localhost:9000/\nlistening on 127.0.0.1:5173\nGET /api 404 Not Found\nERROR in some app log line\n[Nest] 500 Internal server error\nFound 3 errors in payload\n";
        assert_eq!(errors(log), None);
    }

    #[test]
    fn a_project_path_with_spaces_is_cut_off_whole() {
        let log = " FILE  C:/Users/Me/Projects/Windows Apps/Echo Studio/src/x.ts:7:1\n[vue-tsc] Found 1 error. Watching for file changes.\n";
        let found = build_errors(log, r"C:\Users\Me\Projects\Windows Apps\Echo Studio");
        assert_eq!(found.and_then(|e| e.at), Some("src/x.ts:7".into()));
    }

    #[test]
    fn errors_before_an_automatic_restart_are_forgotten() {
        let log = format!(
            "[vue-tsc] Found 1 error. Watching for file changes.\n\n{RESTART_MARK} 1), Echo запускает его снова ---\n\nVITE ready\n"
        );
        assert_eq!(errors(&log), None);
    }

    #[test]
    fn restart_is_due_once_after_a_long_run() {
        let mut file: DevFile = serde_json::from_str(
            r#"{"projectPath":"C:\\P","command":"pnpm dev","pid":7,"startedAt":1000}"#,
        )
        .unwrap();
        assert!(restart_due(Some(1), &file, 61_000, RESTART_AFTER));
        assert!(!restart_due(Some(1), &file, 30_000, RESTART_AFTER));
        assert!(!restart_due(Some(0), &file, 61_000, RESTART_AFTER));
        file.restarted = true;
        assert!(!restart_due(Some(1), &file, 61_000, RESTART_AFTER));
    }

    #[test]
    fn a_crash_restarts_once_and_then_stays_red() {
        let base = std::env::temp_dir().join(format!("echo-dev-restart-{}", std::process::id()));
        let project = base.join("project");
        let dir = base.join("state");
        fs::create_dir_all(&project).unwrap();
        let project_path = project.to_string_lossy().into_owned();
        let (tx, rx) = std::sync::mpsc::channel();
        let args = ["echo run & exit 3".to_owned()];
        let on_exit: OnExit = Arc::new(move || {
            let _ = tx.send(());
        });
        launch(&dir, &project_path, &project, &args, on_exit, None, 0).unwrap();
        rx.recv_timeout(Duration::from_secs(10)).unwrap();
        rx.recv_timeout(Duration::from_secs(10)).unwrap();
        assert!(rx.recv_timeout(Duration::from_secs(2)).is_err());
        let file = read_file(&dir, &slug(&project_path)).unwrap();
        assert!(file.restarted);
        assert_eq!(file.exit_code, Some(3));
        let log = fs::read_to_string(dir.join(format!("{}.log", slug(&project_path)))).unwrap();
        assert_eq!(log.matches("run").count(), 2, "{log}");
        assert_eq!(log.matches("код 3").count(), 1, "{log}");
        assert_eq!(list_in(&dir)[0].state, DevState::Error);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn job_names_are_per_app_and_the_main_app_keeps_its_old_ones() {
        assert_eq!(job_name_in(MAIN_ID, "ab"), "Local\\EchoStudio.dev.ab");
        assert_eq!(
            job_name_in("com.stillmvd.echo-studio.check", "ab"),
            "Local\\EchoStudio.dev.com.stillmvd.echo-studio.check.ab"
        );
    }

    #[test]
    fn a_restart_gives_up_when_stop_came_first() {
        let base = std::env::temp_dir().join(format!("echo-dev-stopped-{}", std::process::id()));
        let project = base.join("project");
        let dir = base.join("state");
        fs::create_dir_all(&project).unwrap();
        let project_path = project.to_string_lossy().into_owned();
        let args = ["ping -n 30 127.0.0.1 > nul".to_owned()];
        runtime().entry(slug(&project_path)).or_default().stopping = true;
        let on_exit: OnExit = Arc::new(|| {});
        let result = launch(&dir, &project_path, &project, &args, on_exit, Some(3), 0);
        assert!(result.is_err());
        let gone = (0..30).any(|_| {
            std::thread::sleep(Duration::from_millis(100));
            running_members(&slug(&project_path), 0).is_empty()
        });
        assert!(gone);
        runtime().remove(&slug(&project_path));
        let _ = fs::remove_dir_all(&base);
    }
}
