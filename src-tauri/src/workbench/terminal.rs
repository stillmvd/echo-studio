use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Emitter, Manager};

use super::is_claude_env;
use super::sessions::{claude_exe, is_short_id};

pub const EVENT_EXIT: &str = "workbench://terminal-exit";
const FLUSH: Duration = Duration::from_millis(16);
const PENDING_CAP: usize = 4 << 20;

struct Term {
    short_id: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct Terminals {
    next: AtomicU64,
    map: Mutex<HashMap<String, Term>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Exited {
    terminal_id: String,
    code: u32,
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(2),
        cols: cols.max(10),
        pixel_width: 0,
        pixel_height: 0,
    }
}

impl Terminals {
    pub fn attach(
        &self,
        app: AppHandle,
        short_id: &str,
        cols: u16,
        rows: u16,
        on_data: Channel<Response>,
    ) -> Result<String, String> {
        if !is_short_id(short_id) {
            return Err(format!("invalid short id: {short_id}"));
        }
        let pair = native_pty_system()
            .openpty(size(cols, rows))
            .map_err(|e| format!("openpty: {e}"))?;
        let mut cmd = CommandBuilder::new(claude_exe());
        cmd.args(["attach", short_id]);
        if let Some(home) = dirs::home_dir() {
            cmd.cwd(home);
        }
        for (key, _) in std::env::vars_os() {
            if is_claude_env(&key.to_string_lossy()) {
                cmd.env_remove(key);
            }
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("claude attach: {e}"))?;
        let killer = child.clone_killer();
        drop(pair.slave);
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("pty reader: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("pty writer: {e}"))?;
        let id = format!("t{}", self.next.fetch_add(1, Ordering::Relaxed));

        let pending = Arc::new(Mutex::new(Vec::<u8>::new()));
        let done = Arc::new(AtomicBool::new(false));
        {
            let pending = pending.clone();
            let done = done.clone();
            std::thread::spawn(move || {
                let mut buf = [0u8; 65536];
                while let Ok(n) = reader.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    if let Ok(mut p) = pending.lock() {
                        p.extend_from_slice(&buf[..n]);
                        if p.len() > PENDING_CAP {
                            let excess = p.len() - PENDING_CAP;
                            p.drain(..excess);
                        }
                    }
                }
                done.store(true, Ordering::Release);
            });
        }
        let mut flush_killer = child.clone_killer();
        std::thread::spawn(move || loop {
            std::thread::sleep(FLUSH);
            let finished = done.load(Ordering::Acquire);
            let chunk = pending.lock().map(|mut p| std::mem::take(&mut *p));
            if let Ok(chunk) = chunk {
                if !chunk.is_empty() && on_data.send(Response::new(chunk)).is_err() {
                    let _ = flush_killer.kill();
                    break;
                }
            }
            if finished {
                break;
            }
        });
        let replaced: Vec<Term> = {
            let mut map = self.map.lock().map_err(|_| "terminal registry poisoned")?;
            let same: Vec<String> = map
                .iter()
                .filter(|(_, t)| t.short_id == short_id)
                .map(|(k, _)| k.clone())
                .collect();
            let replaced = same.iter().filter_map(|k| map.remove(k)).collect();
            map.insert(
                id.clone(),
                Term {
                    short_id: short_id.to_owned(),
                    master: pair.master,
                    writer,
                    killer,
                },
            );
            replaced
        };
        for mut t in replaced {
            let _ = t.killer.kill();
        }
        {
            let id = id.clone();
            let app = app.clone();
            std::thread::spawn(move || {
                let code = child.wait().map(|s| s.exit_code()).unwrap_or(1);
                if let Some(terms) = app.try_state::<Terminals>() {
                    if let Ok(mut map) = terms.map.lock() {
                        map.remove(&id);
                    }
                }
                let _ = app.emit(
                    EVENT_EXIT,
                    Exited {
                        terminal_id: id,
                        code,
                    },
                );
            });
        }
        Ok(id)
    }

    fn with<T>(
        &self,
        id: &str,
        f: impl FnOnce(&mut Term) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut map = self.map.lock().map_err(|_| "terminal registry poisoned")?;
        let term = map.get_mut(id).ok_or_else(|| format!("no terminal {id}"))?;
        f(term)
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        self.with(id, |t| {
            t.writer
                .write_all(data.as_bytes())
                .and_then(|_| t.writer.flush())
                .map_err(|e| format!("pty write: {e}"))
        })
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        self.with(id, |t| {
            t.master
                .resize(size(cols, rows))
                .map_err(|e| format!("pty resize: {e}"))
        })
    }

    pub fn detach(&self, id: &str) -> Result<(), String> {
        let term = self
            .map
            .lock()
            .map_err(|_| "terminal registry poisoned")?
            .remove(id);
        if let Some(mut t) = term {
            let _ = t.killer.kill();
        }
        Ok(())
    }

    pub fn detach_all(&self) {
        let ids: Vec<String> = self
            .map
            .lock()
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default();
        for id in ids {
            let _ = self.detach(&id);
        }
    }
}
