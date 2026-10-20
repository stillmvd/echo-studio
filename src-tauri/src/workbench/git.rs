use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::Stdio;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde::Serialize;

const PARALLEL: usize = 4;
const TIMEOUT: Duration = Duration::from_secs(10);
const POLL: Duration = Duration::from_millis(25);

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub dirty: u32,
    pub ahead: u32,
    pub behind: u32,
    pub upstream: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(untagged)]
pub enum GitState {
    Status(GitStatus),
    Error { error: String },
}

fn number_after(text: &str, key: &str) -> u32 {
    text.find(key)
        .map(|i| {
            text[i + key.len()..]
                .chars()
                .take_while(char::is_ascii_digit)
                .collect::<String>()
        })
        .and_then(|n| n.parse().ok())
        .unwrap_or(0)
}

pub fn parse_status(out: &str) -> GitStatus {
    let mut lines = out.lines();
    let head = lines.next().unwrap_or("");
    let head = head.strip_prefix("## ").unwrap_or(head);
    let branch = head.split("...").next().unwrap_or("");
    let branch = branch.strip_prefix("No commits yet on ").unwrap_or(branch);
    GitStatus {
        branch: branch.to_owned(),
        dirty: lines.filter(|l| !l.is_empty()).count() as u32,
        ahead: number_after(head, "ahead "),
        behind: number_after(head, "behind "),
        upstream: head.contains("..."),
    }
}

fn read_all(mut pipe: impl Read + Send + 'static) -> JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = pipe.read_to_end(&mut buf);
        buf
    })
}

fn status_output(path: &Path) -> Result<Vec<u8>, String> {
    let mut child = super::child_command("git")
        .args(["--no-optional-locks", "-C"])
        .arg(path)
        .args(["status", "--porcelain=v1", "-b"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().map(read_all);
    let stderr = child.stderr.take().map(read_all);
    let started = Instant::now();
    let status = loop {
        let polled = child.try_wait();
        if let Ok(Some(status)) = polled {
            break status;
        }
        if polled.is_err() || started.elapsed() > TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return Err(match polled {
                Err(e) => e.to_string(),
                Ok(_) => "git status timed out".into(),
            });
        }
        std::thread::sleep(POLL);
    };
    let collect =
        |h: Option<JoinHandle<Vec<u8>>>| h.and_then(|h| h.join().ok()).unwrap_or_default();
    let (out, err) = (collect(stdout), collect(stderr));
    if status.success() {
        Ok(out)
    } else {
        Err(String::from_utf8_lossy(&err).trim().to_owned())
    }
}

pub fn git_state(path: &Path) -> Option<GitState> {
    if !path.join(".git").exists() {
        return None;
    }
    Some(match status_output(path) {
        Ok(out) => GitState::Status(parse_status(&String::from_utf8_lossy(&out))),
        Err(error) => GitState::Error { error },
    })
}

pub fn git_states(paths: &[String]) -> HashMap<String, Option<GitState>> {
    let chunk = paths.len().div_ceil(PARALLEL).max(1);
    std::thread::scope(|s| {
        let handles: Vec<_> = paths
            .chunks(chunk)
            .map(|part| {
                let handle = s.spawn(move || {
                    part.iter()
                        .map(|p| (p.clone(), git_state(Path::new(p))))
                        .collect::<Vec<_>>()
                });
                (part, handle)
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|(part, h)| {
                h.join().unwrap_or_else(|_| {
                    part.iter()
                        .map(|p| {
                            let error = "git status failed".to_owned();
                            (p.clone(), Some(GitState::Error { error }))
                        })
                        .collect()
                })
            })
            .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracking_branch_with_ahead_and_behind() {
        let s = parse_status("## main...origin/main [ahead 2, behind 13]\n M src/a.ts\n?? b.txt\n");
        assert_eq!(
            s,
            GitStatus {
                branch: "main".into(),
                dirty: 2,
                ahead: 2,
                behind: 13,
                upstream: true
            }
        );
    }

    #[test]
    fn local_branch_without_upstream() {
        let s = parse_status("## feature/x\n");
        assert_eq!(
            (s.branch.as_str(), s.dirty, s.upstream),
            ("feature/x", 0, false)
        );
    }

    #[test]
    fn fresh_repo_and_detached_head() {
        assert_eq!(
            parse_status("## No commits yet on main\n?? a\n").branch,
            "main"
        );
        assert_eq!(
            parse_status("## HEAD (no branch)\n").branch,
            "HEAD (no branch)"
        );
    }

    #[test]
    fn folder_without_git_is_none() {
        let dir = std::env::temp_dir().join("echo-git-none-test");
        let _ = std::fs::create_dir_all(&dir);
        assert_eq!(git_state(&dir), None);
    }

    #[test]
    fn real_repo_reports_status() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        assert!(matches!(git_state(root), Some(GitState::Status(_))));
    }
}
