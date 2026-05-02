use std::path::PathBuf;
use std::sync::mpsc::channel;
use std::thread;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use tauri::{AppHandle, Emitter};

pub const EVENT_DB_CHANGED: &str = "echovault://changed";

pub fn start_watching(app: AppHandle, db_path: PathBuf) -> anyhow::Result<()> {
    let (tx, rx) = channel();
    let mut debouncer = new_debouncer(Duration::from_millis(500), tx)?;
    debouncer
        .watcher()
        .watch(&db_path, RecursiveMode::NonRecursive)?;

    thread::spawn(move || {
        let _keep_alive = debouncer;
        for result in rx {
            match result {
                Ok(events) if !events.is_empty() => {
                    let _ = app.emit(EVENT_DB_CHANGED, ());
                }
                Ok(_) => {}
                Err(e) => {
                    eprintln!("[echo-studio] watcher error: {e:?}");
                }
            }
        }
    });

    Ok(())
}
