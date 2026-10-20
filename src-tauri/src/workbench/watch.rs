use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use tauri::{AppHandle, Emitter};

pub const EVENT_PROJECTS: &str = "workbench://projects";

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
