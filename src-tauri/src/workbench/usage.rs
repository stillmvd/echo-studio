use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime};

use serde::Serialize;
use serde_json::Value;

use super::projects::{place_for, places, ProjectTree};
use crate::conversations::reader::jsonl_lines;

const WINDOW: Duration = Duration::from_secs(7 * 86_400);

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub week: u64,
    pub today: u64,
    pub sessions: u32,
    pub days: BTreeMap<String, u64>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct FileUsage {
    pub cwd: Option<String>,
    pub entries: Vec<(String, u64)>,
}

type Stamp = (SystemTime, u64);

static CACHE: LazyLock<Mutex<HashMap<PathBuf, (Stamp, FileUsage)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn scan_lines(lines: impl Iterator<Item = String>) -> FileUsage {
    let mut out = FileUsage::default();
    let mut seen = HashSet::new();
    for line in lines {
        if out.cwd.is_some() && !line.contains("\"usage\"") {
            continue;
        }
        let Ok(j) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if out.cwd.is_none() {
            out.cwd = j.get("cwd").and_then(Value::as_str).map(str::to_owned);
        }
        let (Some(u), Some(ts)) = (
            j.pointer("/message/usage"),
            j.get("timestamp").and_then(Value::as_str),
        ) else {
            continue;
        };
        if let Some(id) = j.pointer("/message/id").and_then(Value::as_str) {
            if !seen.insert(id.to_owned()) {
                continue;
            }
        }
        let n = |k: &str| u.get(k).and_then(Value::as_u64).unwrap_or(0);
        let tokens = n("input_tokens") + n("output_tokens") + n("cache_creation_input_tokens");
        out.entries.push((ts.to_owned(), tokens));
    }
    out
}

fn add(into: &mut Usage, from: Usage) {
    into.week += from.week;
    into.today += from.today;
    into.sessions += from.sessions;
    for (day, tokens) in from.days {
        *into.days.entry(day).or_default() += tokens;
    }
}

pub fn aggregate<'a>(
    files: impl Iterator<Item = &'a FileUsage>,
    since: &str,
    today: &str,
) -> HashMap<String, Usage> {
    let mut out: HashMap<String, Usage> = HashMap::new();
    for file in files {
        let Some(cwd) = &file.cwd else { continue };
        let mut usage = Usage::default();
        for (ts, tokens) in &file.entries {
            if ts.as_str() < since {
                continue;
            }
            usage.week += tokens;
            *usage
                .days
                .entry(ts.get(..10).unwrap_or(ts).to_owned())
                .or_default() += tokens;
            if ts.starts_with(today) {
                usage.today += tokens;
            }
        }
        if !usage.days.is_empty() {
            usage.sessions = 1;
            add(out.entry(cwd.clone()).or_default(), usage);
        }
    }
    out
}

pub fn by_project(
    raw: HashMap<String, Usage>,
    project: impl Fn(&str) -> Option<String>,
) -> HashMap<String, Usage> {
    let mut out: HashMap<String, Usage> = HashMap::new();
    for (cwd, usage) in raw {
        let key = project(&cwd).unwrap_or(cwd);
        add(out.entry(key).or_default(), usage);
    }
    out
}

fn slug_of(transcript: &Path) -> Option<String> {
    transcript
        .parent()?
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
}

fn transcripts(base: &Path, cutoff: SystemTime) -> Vec<(PathBuf, Stamp)> {
    let Ok(dirs) = std::fs::read_dir(base) else {
        return Vec::new();
    };
    dirs.filter_map(Result::ok)
        .filter_map(|d| std::fs::read_dir(d.path()).ok())
        .flatten()
        .filter_map(Result::ok)
        .filter(|f| f.path().extension().is_some_and(|e| e == "jsonl"))
        .filter_map(|f| {
            let meta = f.metadata().ok()?;
            let mtime = meta.modified().ok()?;
            (mtime >= cutoff).then(|| (f.path(), (mtime, meta.len())))
        })
        .collect()
}

pub fn read_usage(tree: &ProjectTree) -> HashMap<String, Usage> {
    let Some(base) = dirs::home_dir().map(|h| h.join(".claude").join("projects")) else {
        return HashMap::new();
    };
    let now = SystemTime::now();
    let cutoff = now - WINDOW;
    let since = humantime::format_rfc3339_millis(cutoff).to_string();
    let today = humantime::format_rfc3339_seconds(now).to_string()[..10].to_string();
    let files = transcripts(&base, cutoff);
    let live: HashSet<&PathBuf> = files.iter().map(|(p, _)| p).collect();
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    cache.retain(|p, _| live.contains(p));
    for (path, stamp) in &files {
        if cache.get(path).is_some_and(|(s, _)| s == stamp) {
            continue;
        }
        let Ok(file) = File::open(path) else { continue };
        let mut usage = scan_lines(jsonl_lines(BufReader::new(file)));
        if usage.cwd.is_none() {
            usage.cwd = slug_of(path);
        }
        cache.insert(path.clone(), (*stamp, usage));
    }
    let raw = aggregate(cache.values().map(|(_, f)| f), &since, &today);
    by_project(raw, |cwd| {
        place_for(tree, cwd)
            .or_else(|| places(tree).find(|p| claude_slug(&p.path) == cwd))
            .map(|p| p.path.clone())
    })
}

pub fn claude_slug(path: &str) -> String {
    path.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(text: &str) -> impl Iterator<Item = String> + '_ {
        text.lines().map(str::to_owned)
    }

    const TRANSCRIPT: &str = r#"{"type":"user","cwd":"C:\\Users\\me\\Projects\\Freelance\\AM 2.0\\apps\\api","timestamp":"2026-10-20T10:00:00.000Z"}
{"type":"assistant","timestamp":"2026-10-20T10:00:01.000Z","message":{"id":"m1","usage":{"input_tokens":10,"output_tokens":5,"cache_creation_input_tokens":100,"cache_read_input_tokens":9999}}}
{"type":"assistant","timestamp":"2026-10-20T10:00:02.000Z","message":{"id":"m1","usage":{"input_tokens":10,"output_tokens":5,"cache_creation_input_tokens":100}}}
not json
{"type":"assistant","timestamp":"2026-10-19T09:00:00.000Z","message":{"id":"m2","usage":{"input_tokens":1,"output_tokens":2}}}
{"type":"assistant","timestamp":"2026-10-01T09:00:00.000Z","message":{"id":"m3","usage":{"input_tokens":1000}}}"#;

    #[test]
    fn claude_slug_matches_project_folder_names() {
        assert_eq!(
            claude_slug(r"C:\Users\stillmvd\Projects\Windows Apps\Echo Studio"),
            "C--Users-stillmvd-Projects-Windows-Apps-Echo-Studio"
        );
        assert_eq!(claude_slug(r"C:\P\AM 2.0"), "C--P-AM-2-0");
    }

    #[test]
    fn transcript_without_cwd_falls_back_to_its_slug() {
        let path = Path::new(r"C:\Users\me\.claude\projects\C--Users-me-Projects\s.jsonl");
        assert_eq!(slug_of(path).as_deref(), Some("C--Users-me-Projects"));
    }

    #[test]
    fn scan_dedups_by_message_id_and_skips_cache_reads() {
        let usage = scan_lines(lines(TRANSCRIPT));
        assert_eq!(
            usage.cwd.as_deref(),
            Some(r"C:\Users\me\Projects\Freelance\AM 2.0\apps\api")
        );
        assert_eq!(
            usage.entries,
            vec![
                ("2026-10-20T10:00:01.000Z".to_owned(), 115),
                ("2026-10-19T09:00:00.000Z".to_owned(), 3),
                ("2026-10-01T09:00:00.000Z".to_owned(), 1000),
            ]
        );
    }

    #[test]
    fn aggregate_counts_week_today_days_and_sessions() {
        let file = scan_lines(lines(TRANSCRIPT));
        let old = FileUsage {
            cwd: Some("C:\\x".into()),
            entries: vec![("2026-09-01T00:00:00.000Z".into(), 7)],
        };
        let raw = aggregate(
            [&file, &file, &old].into_iter(),
            "2026-10-13T12:00:00.000Z",
            "2026-10-20",
        );
        let api = &raw[r"C:\Users\me\Projects\Freelance\AM 2.0\apps\api"];
        assert_eq!(api.week, 236);
        assert_eq!(api.today, 230);
        assert_eq!(api.sessions, 2);
        assert_eq!(api.days.get("2026-10-19"), Some(&6));
        assert!(!raw.contains_key("C:\\x"));
    }

    #[test]
    fn by_project_merges_subfolders_and_keeps_unknown_cwd() {
        let mut raw = HashMap::new();
        raw.insert(
            "P\\AM\\apps\\api".to_owned(),
            Usage {
                week: 5,
                today: 1,
                sessions: 1,
                days: BTreeMap::from([("d".into(), 5)]),
            },
        );
        raw.insert(
            "P\\AM\\apps\\web".to_owned(),
            Usage {
                week: 3,
                today: 0,
                sessions: 2,
                days: BTreeMap::from([("d".into(), 3)]),
            },
        );
        raw.insert(
            "P".to_owned(),
            Usage {
                week: 1,
                ..Usage::default()
            },
        );
        let out = by_project(raw, |cwd| {
            cwd.starts_with("P\\AM").then(|| "P\\AM".to_owned())
        });
        assert_eq!(out["P\\AM"].week, 8);
        assert_eq!(out["P\\AM"].sessions, 3);
        assert_eq!(out["P\\AM"].days["d"], 8);
        assert_eq!(out["P"].week, 1);
    }
}
