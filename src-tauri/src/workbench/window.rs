use std::collections::HashSet;
use std::sync::Mutex;

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::System::Console::{
    AttachConsole, FreeConsole, GetConsoleWindow, ATTACH_PARENT_PROCESS,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetClassNameW, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow,
    GA_ROOTOWNER, SW_RESTORE,
};

const MAX_DEPTH: usize = 30;
const PSEUDO_CONSOLE: &str = "PseudoConsoleWindow";

static CONSOLE: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Focus {
    Focused,
    Vscode,
    NotFound,
}

pub fn ancestors(sys: &System, pid: u32) -> Vec<String> {
    let mut names = Vec::new();
    let mut seen = HashSet::new();
    let mut cur = sys.process(Pid::from_u32(pid)).and_then(|p| p.parent());
    while let Some(pid) = cur.filter(|p| seen.insert(*p)) {
        if names.len() >= MAX_DEPTH {
            break;
        }
        let Some(p) = sys.process(pid) else {
            break;
        };
        names.push(p.name().to_string_lossy().into_owned());
        cur = p.parent();
    }
    names
}

fn in_vscode(pid: u32) -> bool {
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    ancestors(&sys, pid)
        .iter()
        .any(|n| n.eq_ignore_ascii_case("code.exe"))
}

fn class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 64];
    let len = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    String::from_utf16_lossy(&buf[..len.max(0) as usize])
}

fn console_window(pid: u32) -> Option<HWND> {
    let _guard = CONSOLE.lock().unwrap_or_else(|e| e.into_inner());
    let had_console = unsafe { !GetConsoleWindow().is_null() };
    let attached = unsafe {
        if AttachConsole(pid) == 0 {
            FreeConsole();
            AttachConsole(pid) != 0
        } else {
            true
        }
    };
    let hwnd = attached.then(|| unsafe { GetConsoleWindow() });
    unsafe {
        FreeConsole();
        if had_console {
            AttachConsole(ATTACH_PARENT_PROCESS);
        }
    }
    hwnd.filter(|h| !h.is_null())
}

fn target_window(console: HWND) -> Option<HWND> {
    if class_name(console) != PSEUDO_CONSOLE {
        return unsafe { IsWindowVisible(console) != 0 }.then_some(console);
    }
    let owner = unsafe { GetAncestor(console, GA_ROOTOWNER) };
    (!owner.is_null() && owner != console).then_some(owner)
}

pub fn focus(pid: u32) -> Focus {
    if in_vscode(pid) {
        return Focus::Vscode;
    }
    let Some(hwnd) = console_window(pid).and_then(target_window) else {
        return Focus::NotFound;
    };
    unsafe {
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
        if SetForegroundWindow(hwnd) == 0 {
            return Focus::NotFound;
        }
    }
    Focus::Focused
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn focus_on_self_does_not_panic() {
        let got = focus(std::process::id());
        assert!(matches!(got, Focus::NotFound | Focus::Focused), "{got:?}");
    }

    #[test]
    fn ancestors_of_missing_pid_are_empty() {
        let mut sys = System::new();
        sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing(),
        );
        assert!(ancestors(&sys, u32::MAX - 1).is_empty());
        assert!(!ancestors(&sys, std::process::id()).is_empty());
    }

    #[test]
    #[ignore]
    fn focus_live() {
        let pid: u32 = std::env::var("FOCUS_PID").unwrap().parse().unwrap();
        assert_eq!(focus(pid), Focus::Focused);
    }
}
