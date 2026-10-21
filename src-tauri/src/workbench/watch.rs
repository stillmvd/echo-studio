use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use tauri::{AppHandle, Emitter};

use super::sessions;

pub const EVENT_PROJECTS: &str = "workbench://projects";
pub const EVENT_SESSIONS: &str = "workbench://sessions";
const SESSIONS_TICK: Duration = Duration::from_secs(15);
const SESSIONS_MIN_GAP: Duration = Duration::from_secs(3);

pub struct SessionsHub {
    pub active: AtomicBool,
    poke: Mutex<mpsc::Sender<()>>,
}

impl SessionsHub {
    pub fn poke(&self) {
        if let Ok(tx) = self.poke.lock() {
            let _ = tx.send(());
        }
    }
}

pub fn start_sessions(app: AppHandle) -> SessionsHub {
    let (tx, rx) = mpsc::channel::<()>();
    let hook_tx = tx.clone();
    std::thread::spawn(move || {
        let debouncer = new_debouncer(
            Duration::from_millis(500),
            move |res: DebounceEventResult| {
                if res.is_ok() {
                    let _ = hook_tx.send(());
                }
            },
        );
        let mut debouncer = debouncer.ok();
        let mut watching = false;
        let mut last: Option<Instant> = None;
        loop {
            if !watching {
                if let (Some(d), Some(dir)) = (debouncer.as_mut(), sessions::hooks_dir()) {
                    watching = d.watcher().watch(&dir, RecursiveMode::NonRecursive).is_ok();
                }
            }
            match rx.recv_timeout(SESSIONS_TICK) {
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Ok(()) | Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            if let Some(t) = last {
                if let Some(wait) = SESSIONS_MIN_GAP.checked_sub(t.elapsed()) {
                    std::thread::sleep(wait);
                }
            }
            while rx.try_recv().is_ok() {}
            let Some(hub) = tauri::Manager::try_state::<SessionsHub>(&app) else {
                continue;
            };
            if !hub.active.load(Ordering::Relaxed) {
                continue;
            }
            last = Some(Instant::now());
            if let Ok(list) = sessions::list() {
                let _ = app.emit(EVENT_SESSIONS, list);
            }
        }
    });
    SessionsHub {
        active: AtomicBool::new(false),
        poke: Mutex::new(tx),
    }
}

fn group_dirs(root: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(root)
        .map(|it| {
            it.filter_map(|e| e.ok())
                .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
                .map(|e| e.path())
                .collect()
        })
        .unwrap_or_default()
}

pub fn start_projects(app: AppHandle, root: PathBuf) {
    std::thread::spawn(move || {
        if !root.is_dir() {
            return;
        }
        let (tx, rx) = mpsc::channel::<DebounceEventResult>();
        let Ok(mut debouncer) = new_debouncer(Duration::from_millis(500), tx) else {
            return;
        };
        let mut watched = vec![root.clone()];
        watched.extend(group_dirs(&root));
        for dir in &watched {
            let _ = debouncer.watcher().watch(dir, RecursiveMode::NonRecursive);
        }
        for events in rx {
            if events.is_err() {
                continue;
            }
            for dir in group_dirs(&root) {
                if !watched.contains(&dir)
                    && debouncer
                        .watcher()
                        .watch(&dir, RecursiveMode::NonRecursive)
                        .is_ok()
                {
                    watched.push(dir);
                }
            }
            let _ = app.emit(EVENT_PROJECTS, ());
        }
    });
}
