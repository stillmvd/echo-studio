use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::MEMORY_DIR;

pub const EVENT_CHANGED: &str = "memory://changed";

#[derive(Debug, Clone, Serialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct Changed {
    pub slug: String,
}

pub fn slug_of(path: &Path, root: &Path) -> Option<String> {
    if path
        .file_name()
        .is_some_and(|n| n.to_string_lossy().ends_with(".echo-studio.tmp"))
    {
        return None;
    }
    let mut parts = path.strip_prefix(root).ok()?.components();
    let slug = match parts.next()? {
        Component::Normal(s) => s.to_string_lossy().into_owned(),
        _ => return None,
    };
    match parts.next()? {
        Component::Normal(s) if s == MEMORY_DIR => Some(slug),
        _ => None,
    }
}

pub fn start(app: AppHandle, root: PathBuf) {
    std::thread::spawn(move || {
        if !root.is_dir() {
            return;
        }
        let (tx, rx) = mpsc::channel::<DebounceEventResult>();
        let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[echo-studio] memory watcher: {e}");
                return;
            }
        };
        if let Err(e) = debouncer.watcher().watch(&root, RecursiveMode::Recursive) {
            eprintln!("[echo-studio] watch {}: {e}", root.display());
            return;
        }
        for events in rx {
            let Ok(events) = events else { continue };
            let changed: BTreeSet<Changed> = events
                .iter()
                .filter_map(|e| slug_of(&e.path, &root))
                .map(|slug| Changed { slug })
                .collect();
            if !changed.is_empty() {
                let _ = app.emit(EVENT_CHANGED, changed.into_iter().collect::<Vec<_>>());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_memory_paths_only() {
        let root = Path::new(r"C:\h\.claude\projects");
        assert_eq!(
            slug_of(&root.join(r"C--p\memory\a.md"), root),
            Some("C--p".into())
        );
        assert_eq!(
            slug_of(&root.join(r"C--p\memory\sessions\s.md"), root),
            Some("C--p".into())
        );
        assert_eq!(slug_of(&root.join(r"C--p\abc.jsonl"), root), None);
        assert_eq!(
            slug_of(&root.join(r"C--p\memory\.a.md.echo-studio.tmp"), root),
            None
        );
    }
}
