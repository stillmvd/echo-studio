use std::io::Write;
use std::path::Path;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::workbench::{self, dev, projects, request};

const WAIT_DEFAULT: u64 = 120;
const POLL: Duration = Duration::from_millis(500);
const LAUNCH_WAIT: Duration = Duration::from_secs(30);
const STALE_SLACK_MS: u64 = 2_000;
const LOG_LINES: usize = 20;

pub const EXIT_FAILED: i32 = 1;
pub const EXIT_BAD_PROJECT: i32 = 2;
pub const EXIT_TIMEOUT: i32 = 3;
pub const EXIT_NO_ECHO: i32 = 4;

#[derive(Debug, PartialEq)]
struct Fail(i32, String);

pub fn run(identifier: &str) -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    let raw = request::path_arg(&args)?;
    imp::attach_console();
    let code = match start(identifier, &raw, timeout_arg(&args)) {
        Ok(url) => {
            let _ = writeln!(std::io::stdout(), "{url}");
            0
        }
        Err(Fail(code, message)) => {
            let _ = writeln!(std::io::stderr(), "{message}");
            code
        }
    };
    let _ = std::io::stdout().flush();
    let _ = std::io::stderr().flush();
    Some(code)
}

fn timeout_arg(args: &[String]) -> Duration {
    let secs = args
        .iter()
        .position(|a| a == "--timeout")
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(WAIT_DEFAULT);
    Duration::from_secs(secs)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn check(path: &str) -> Result<String, String> {
    let project = projects::ensure_project(path)?;
    projects::dev_args(Path::new(&project.path))
        .map(|_| project.path.clone())
        .ok_or_else(|| format!("У проекта нет dev-команды: {}", project.path))
}

fn start(identifier: &str, raw: &str, timeout: Duration) -> Result<String, Fail> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err(Fail(
            EXIT_BAD_PROJECT,
            "Нужна папка проекта после --dev".into(),
        ));
    }
    let abs = std::path::absolute(raw)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| raw.to_owned());
    let checked = check(&abs);
    let target = checked.clone().unwrap_or(abs);
    let _ = dev::take_failure(&target);
    let since = now_ms();
    deliver(identifier, &target)?;
    let path = checked.map_err(|e| Fail(EXIT_BAD_PROJECT, e))?;
    wait(&path, since, timeout)
}

fn wait_window(identifier: &str) -> bool {
    let deadline = Instant::now() + LAUNCH_WAIT;
    while Instant::now() < deadline {
        if imp::has_window(identifier) {
            return true;
        }
        std::thread::sleep(POLL);
    }
    false
}

fn deliver(identifier: &str, path: &str) -> Result<(), Fail> {
    if imp::forward(identifier, path) {
        return Ok(());
    }
    if !imp::is_running(identifier) {
        if cfg!(debug_assertions) {
            return Err(Fail(
                EXIT_NO_ECHO,
                "Echo Studio не запущен — запустите его и повторите".into(),
            ));
        }
        let exe = std::env::current_exe().map_err(|e| Fail(EXIT_NO_ECHO, e.to_string()))?;
        workbench::child_command("explorer.exe")
            .arg(exe)
            .spawn()
            .map_err(|e| {
                Fail(
                    EXIT_NO_ECHO,
                    format!("Не удалось запустить Echo Studio: {e}"),
                )
            })?;
    }
    if wait_window(identifier) && imp::forward(identifier, path) {
        return Ok(());
    }
    Err(Fail(
        EXIT_NO_ECHO,
        format!("Echo Studio не ответил за {} с", LAUNCH_WAIT.as_secs()),
    ))
}

fn log_note(server: &dev::DevServer) -> String {
    let tail = dev::log_lines(&server.log, LOG_LINES);
    if tail.is_empty() {
        format!("Лог: {}", server.log)
    } else {
        format!("Лог: {}\n{tail}", server.log)
    }
}

fn verdict(server: &dev::DevServer, since: u64, watched: Option<u64>) -> Option<Result<u16, Fail>> {
    let fresh = server.started_at + STALE_SLACK_MS >= since || watched == Some(server.started_at);
    match server.state {
        dev::DevState::Running if !server.ports.is_empty() => {
            Some(Ok(dev::server_port(server).unwrap_or(server.ports[0])))
        }
        dev::DevState::Error | dev::DevState::Stopped if fresh => Some(Err(Fail(
            EXIT_FAILED,
            format!(
                "dev остановился (код {}). {}",
                server
                    .exit_code
                    .map_or_else(|| "неизвестен".to_owned(), |c| c.to_string()),
                log_note(server)
            ),
        ))),
        _ => None,
    }
}

fn wait(path: &str, since: u64, timeout: Duration) -> Result<String, Fail> {
    let deadline = Instant::now() + timeout;
    let mut watched = None;
    loop {
        if let Some(e) = dev::take_failure(path) {
            return Err(Fail(EXIT_FAILED, format!("dev не запустился: {e}")));
        }
        let server = dev::status(path);
        if let Some(s) = server.as_ref().filter(|s| !s.pids.is_empty()) {
            watched = Some(s.started_at);
        }
        if let Some(result) = server.as_ref().and_then(|s| verdict(s, since, watched)) {
            return result.map(|port| format!("http://localhost:{port}"));
        }
        if Instant::now() >= deadline {
            let note = server.as_ref().map(log_note).unwrap_or_default();
            let text = format!(
                "dev не открыл порт за {} с, но запуск продолжается. {note}",
                timeout.as_secs()
            );
            return Err(Fail(EXIT_TIMEOUT, text.trim_end().to_owned()));
        }
        std::thread::sleep(POLL);
    }
}

#[cfg(windows)]
mod imp {
    use windows_sys::Win32::Foundation::{CloseHandle, FALSE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Console::{
        AttachConsole, GetStdHandle, ATTACH_PARENT_PROCESS, STD_ERROR_HANDLE, STD_OUTPUT_HANDLE,
    };
    use windows_sys::Win32::System::DataExchange::COPYDATASTRUCT;
    use windows_sys::Win32::System::Threading::OpenMutexW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        FindWindowW, SendMessageTimeoutW, SMTO_NORMAL, WM_COPYDATA,
    };

    use crate::workbench::request::FLAG;

    const SINGLE_INSTANCE_DATA_NUL: usize = 1543;
    const FORWARD_TIMEOUT_MS: u32 = 10_000;
    const SYNCHRONIZE: u32 = 0x0010_0000;

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    pub fn attach_console() {
        let missing = |id| unsafe {
            let h = GetStdHandle(id);
            h.is_null() || h == INVALID_HANDLE_VALUE
        };
        if missing(STD_OUTPUT_HANDLE) || missing(STD_ERROR_HANDLE) {
            unsafe { AttachConsole(ATTACH_PARENT_PROCESS) };
        }
    }

    fn target(identifier: &str) -> windows_sys::Win32::Foundation::HWND {
        let class = wide(&format!("{identifier}-sic"));
        let title = wide(&format!("{identifier}-siw"));
        unsafe { FindWindowW(class.as_ptr(), title.as_ptr()) }
    }

    pub fn has_window(identifier: &str) -> bool {
        !target(identifier).is_null()
    }

    pub fn is_running(identifier: &str) -> bool {
        let name = wide(&format!("{identifier}-sim"));
        let handle = unsafe { OpenMutexW(SYNCHRONIZE, FALSE, name.as_ptr()) };
        if handle.is_null() {
            return false;
        }
        unsafe { CloseHandle(handle) };
        true
    }

    pub fn forward(identifier: &str, path: &str) -> bool {
        let hwnd = target(identifier);
        if hwnd.is_null() {
            return false;
        }
        let cwd = std::env::current_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        let exe = std::env::args().next().unwrap_or_default();
        let data = format!("{cwd}\0{exe}\0{FLAG}\0{path}");
        let bytes = data.as_bytes();
        let cds = COPYDATASTRUCT {
            dwData: SINGLE_INSTANCE_DATA_NUL,
            cbData: bytes.len() as u32,
            lpData: bytes.as_ptr() as *mut _,
        };
        let sent = unsafe {
            SendMessageTimeoutW(
                hwnd,
                WM_COPYDATA,
                0,
                &cds as *const COPYDATASTRUCT as isize,
                SMTO_NORMAL,
                FORWARD_TIMEOUT_MS,
                std::ptr::null_mut(),
            )
        };
        sent != 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(state: dev::DevState, ports: Vec<u16>, started_at: u64) -> dev::DevServer {
        dev::DevServer {
            project_path: "C:\\P\\A".into(),
            command: "pnpm dev".into(),
            state,
            ports,
            started_at,
            exit_code: Some(1),
            log: String::new(),
            pids: Vec::new(),
            errors: None,
            restarted: false,
        }
    }

    #[test]
    fn reads_timeout() {
        let args = |l: &[&str]| l.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
        assert_eq!(
            timeout_arg(&args(&["e", "--dev", "x"])).as_secs(),
            WAIT_DEFAULT
        );
        assert_eq!(timeout_arg(&args(&["e", "--timeout", "30"])).as_secs(), 30);
    }

    #[test]
    fn running_with_port_is_ready_even_if_started_before() {
        let s = server(dev::DevState::Running, vec![5173], 1_000);
        assert_eq!(verdict(&s, 100_000, None), Some(Ok(5173)));
    }

    #[test]
    fn stale_stop_is_ignored_fresh_stop_fails() {
        let old = server(dev::DevState::Stopped, Vec::new(), 1_000);
        assert_eq!(verdict(&old, 100_000, None), None);
        let new = server(dev::DevState::Error, Vec::new(), 99_500);
        assert!(matches!(
            verdict(&new, 100_000, None),
            Some(Err(Fail(EXIT_FAILED, _)))
        ));
    }

    #[test]
    fn a_watched_run_that_started_earlier_fails_at_once() {
        let crashed = server(dev::DevState::Error, Vec::new(), 90_000);
        assert!(matches!(
            verdict(&crashed, 100_000, Some(90_000)),
            Some(Err(Fail(EXIT_FAILED, _)))
        ));
        assert_eq!(verdict(&crashed, 100_000, Some(80_000)), None);
    }

    #[test]
    fn starting_waits() {
        let s = server(dev::DevState::Starting, Vec::new(), 100_000);
        assert_eq!(verdict(&s, 100_000, None), None);
        let quiet = server(dev::DevState::Running, Vec::new(), 100_000);
        assert_eq!(verdict(&quiet, 100_000, None), None);
    }
}
