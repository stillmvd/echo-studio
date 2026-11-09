use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::{dev, projects};

pub const FLAG: &str = "--dev";
pub const RESTART_FLAG: &str = "--restart";
pub const EVENT_DEV_REQUEST: &str = "workbench://dev-request";

#[derive(Debug, Clone, PartialEq)]
pub struct Arg {
    pub path: String,
    pub restart: bool,
}

impl Arg {
    pub fn flag(&self) -> &'static str {
        if self.restart {
            RESTART_FLAG
        } else {
            FLAG
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DevRequest {
    pub project_path: String,
    pub error: Option<String>,
}

static PENDING: Mutex<Vec<DevRequest>> = Mutex::new(Vec::new());

pub fn path_arg(args: &[String]) -> Option<Arg> {
    let at = args.iter().position(|a| a == FLAG || a == RESTART_FLAG)?;
    Some(Arg {
        path: args.get(at + 1).cloned().unwrap_or_default(),
        restart: args[at] == RESTART_FLAG,
    })
}

pub fn take() -> Vec<DevRequest> {
    std::mem::take(&mut *PENDING.lock().unwrap_or_else(|e| e.into_inner()))
}

fn push(request: DevRequest) {
    PENDING
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .push(request);
}

fn run(app: &AppHandle, path: &str, restart: bool) -> DevRequest {
    let project = match projects::ensure_project(path) {
        Ok(p) => p,
        Err(e) => {
            return DevRequest {
                project_path: path.to_owned(),
                error: Some(e),
            }
        }
    };
    if restart {
        if let Err(e) = dev::stop(&project.path) {
            if dev::status(&project.path).is_some() {
                dev::note_failure(&project.path, &e);
                return DevRequest {
                    project_path: project.path,
                    error: Some(e),
                };
            }
        }
        let _ = app.emit(dev::EVENT_DEV, ());
    }
    let notify = app.clone();
    let error = match dev::start(&project.path, move || {
        let _ = notify.emit(dev::EVENT_DEV, ());
    }) {
        Ok(_) => None,
        Err(e) if e == dev::ALREADY_RUNNING => None,
        Err(e) => {
            dev::note_failure(&project.path, &e);
            Some(e)
        }
    };
    DevRequest {
        project_path: project.path,
        error,
    }
}

pub fn handle(app: &AppHandle, arg: Arg) {
    let app = app.clone();
    std::thread::spawn(move || {
        push(run(&app, &arg.path, arg.restart));
        let _ = app.emit(dev::EVENT_DEV, ());
        let _ = app.emit(EVENT_DEV_REQUEST, ());
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn reads_path_after_flag() {
        let dev = |path: &str| {
            Some(Arg {
                path: path.into(),
                restart: false,
            })
        };
        assert_eq!(
            path_arg(&args(&["echo.exe", "--dev", "C:\\P\\A"])),
            dev("C:\\P\\A")
        );
        assert_eq!(path_arg(&args(&["echo.exe", "--dev"])), dev(""));
        assert_eq!(path_arg(&args(&["echo.exe"])), None);
    }

    #[test]
    fn reads_path_after_restart_flag() {
        let restart = |path: &str| {
            Some(Arg {
                path: path.into(),
                restart: true,
            })
        };
        assert_eq!(
            path_arg(&args(&["echo.exe", "--restart", "C:\\P\\A"])),
            restart("C:\\P\\A")
        );
        assert_eq!(
            path_arg(&args(&[
                "echo.exe",
                "--restart",
                "C:\\P\\A",
                "--timeout",
                "30"
            ])),
            restart("C:\\P\\A")
        );
        assert_eq!(path_arg(&args(&["echo.exe", "--restart"])), restart(""));
        assert_eq!(
            path_arg(&args(&["echo.exe", "--restart", "C:\\P\\A"])).map(|a| a.flag()),
            Some(RESTART_FLAG)
        );
    }
}
