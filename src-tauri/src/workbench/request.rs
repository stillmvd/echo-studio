use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::{dev, projects};

pub const FLAG: &str = "--dev";
pub const EVENT_DEV_REQUEST: &str = "workbench://dev-request";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DevRequest {
    pub project_path: String,
    pub error: Option<String>,
}

static PENDING: Mutex<Vec<DevRequest>> = Mutex::new(Vec::new());

pub fn path_arg(args: &[String]) -> Option<String> {
    let at = args.iter().position(|a| a == FLAG)?;
    Some(args.get(at + 1).cloned().unwrap_or_default())
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

fn run(app: &AppHandle, path: &str) -> DevRequest {
    let project = match projects::ensure_project(path) {
        Ok(p) => p,
        Err(e) => {
            return DevRequest {
                project_path: path.to_owned(),
                error: Some(e),
            }
        }
    };
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

pub fn handle(app: &AppHandle, path: String) {
    let app = app.clone();
    std::thread::spawn(move || {
        push(run(&app, &path));
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
        assert_eq!(
            path_arg(&args(&["echo.exe", "--dev", "C:\\P\\A"])),
            Some("C:\\P\\A".into())
        );
        assert_eq!(path_arg(&args(&["echo.exe", "--dev"])), Some(String::new()));
        assert_eq!(path_arg(&args(&["echo.exe"])), None);
    }
}
