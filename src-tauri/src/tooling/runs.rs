use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DAY_MS: i64 = 86_400_000;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Tally {
    pub n: u32,
    pub last: i64,
    pub days: BTreeMap<i64, u32>,
}

impl Tally {
    fn hit(&mut self, ts: i64) {
        self.n += 1;
        self.last = self.last.max(ts);
        *self.days.entry(ts.div_euclid(DAY_MS)).or_insert(0) += 1;
    }

    fn merge(&mut self, other: &Tally) {
        self.n += other.n;
        self.last = self.last.max(other.last);
        for (d, n) in &other.days {
            *self.days.entry(*d).or_insert(0) += n;
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct FileRuns {
    pub first: Option<i64>,
    pub hits: BTreeMap<String, Tally>,
}

pub fn key(via: char, raw: &str) -> String {
    format!("{via}|{raw}")
}

pub fn iso_ms(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[10] != b'T' {
        return None;
    }
    let n = |r: std::ops::Range<usize>| s.get(r)?.parse::<i64>().ok();
    let (y, m, d) = (n(0..4)?, n(5..7)?, n(8..10)?);
    let (h, mi, sec) = (n(11..13)?, n(14..16)?, n(17..19)?);
    let ms = if b.get(19) == Some(&b'.') {
        let frac: String = s[20..]
            .chars()
            .take_while(char::is_ascii_digit)
            .take(3)
            .collect();
        format!("{frac:0<3}").parse::<i64>().ok()?
    } else {
        0
    };
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * DAY_MS + (h * 3600 + mi * 60 + sec) * 1000 + ms)
}

fn command_name(text: &str) -> Option<&str> {
    let start = text.find("<command-name>")? + "<command-name>".len();
    let end = text[start..].find("</command-name>")? + start;
    let name = text[start..end].trim().trim_start_matches('/');
    (!name.is_empty()).then_some(name)
}

fn skill_name(raw: &str) -> &str {
    if raw.contains('/') {
        raw.rsplit(':').next().unwrap_or(raw)
    } else {
        raw
    }
}

#[cfg(test)]
fn scan_lines(lines: impl Iterator<Item = String>) -> FileRuns {
    let mut out = FileRuns::default();
    for line in lines {
        scan_line(&mut out, &line);
    }
    out
}

fn scan_file(path: &Path) -> FileRuns {
    let mut out = FileRuns::default();
    let Ok(file) = File::open(path) else {
        return out;
    };
    let mut reader = BufReader::with_capacity(1 << 20, file);
    let mut buf = Vec::new();
    while reader.read_until(b'\n', &mut buf).is_ok_and(|n| n > 0) {
        match std::str::from_utf8(&buf) {
            Ok(line) => scan_line(&mut out, line),
            Err(_) => scan_line(&mut out, &String::from_utf8_lossy(&buf)),
        }
        buf.clear();
    }
    out
}

fn scan_line(out: &mut FileRuns, line: &str) {
    {
        let cmd = line.contains("<command-name>");
        if !cmd && !line.contains(r#""type":"tool_use""#) {
            if out.first.is_none() && line.contains("\"timestamp\"") {
                out.first = serde_json::from_str::<Value>(line)
                    .ok()
                    .and_then(|v| v.get("timestamp")?.as_str().and_then(iso_ms));
            }
            return;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            return;
        };
        let Some(ts) = v.get("timestamp").and_then(Value::as_str).and_then(iso_ms) else {
            return;
        };
        out.first = Some(out.first.map_or(ts, |f| f.min(ts)));
        let content = v.pointer("/message/content");
        let mut hit = |via: char, raw: &str| out.hits.entry(key(via, raw)).or_default().hit(ts);
        match v.get("type").and_then(Value::as_str) {
            Some("user") if cmd => {
                let text = match content {
                    Some(Value::String(s)) => s.clone(),
                    Some(Value::Array(a)) => a
                        .iter()
                        .filter_map(|x| x.get("text").and_then(Value::as_str))
                        .collect(),
                    _ => String::new(),
                };
                if let Some(name) = command_name(&text) {
                    hit('c', name);
                }
            }
            Some("assistant") => {
                for x in content.and_then(Value::as_array).into_iter().flatten() {
                    if x.get("type").and_then(Value::as_str) != Some("tool_use") {
                        continue;
                    }
                    let name = x.get("name").and_then(Value::as_str).unwrap_or_default();
                    let input = |k: &str| x.pointer(&format!("/input/{k}")).and_then(Value::as_str);
                    match name {
                        "Skill" => {
                            if let Some(s) = input("skill") {
                                hit('s', skill_name(s));
                            }
                        }
                        "Agent" | "Task" => {
                            hit('a', input("subagent_type").unwrap_or("general-purpose"))
                        }
                        _ => {
                            if let Some(server) = name
                                .strip_prefix("mcp__")
                                .and_then(|r| r.split("__").next())
                            {
                                hit('m', server);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

type Stamp = (u64, u64);

#[derive(Default, Serialize, Deserialize)]
struct Cache {
    #[serde(default)]
    v: u32,
    files: HashMap<PathBuf, (Stamp, String, FileRuns)>,
}

const CACHE_V: u32 = 1;

static CACHE: LazyLock<Mutex<Option<Cache>>> = LazyLock::new(|| Mutex::new(None));

fn stamp(path: &Path) -> Option<Stamp> {
    let meta = fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    Some((mtime, meta.len()))
}

fn transcripts(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            transcripts(&p, out);
        } else if p.extension().is_some_and(|x| x == "jsonl") {
            out.push(p);
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Agg {
    pub tally: Tally,
    pub slugs: HashMap<String, u32>,
}

#[derive(Debug, Default)]
pub struct Runs {
    pub start: Option<i64>,
    pub by_key: HashMap<String, Agg>,
}

pub fn collect(projects_dir: &Path, cache_file: Option<&Path>) -> Runs {
    let mut files = Vec::new();
    transcripts(projects_dir, &mut files);
    let mut slot = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let cache = slot.get_or_insert_with(|| {
        cache_file
            .and_then(|f| fs::read(f).ok())
            .and_then(|b| serde_json::from_slice::<Cache>(&b).ok())
            .filter(|c| c.v == CACHE_V)
            .unwrap_or_default()
    });
    let mut fresh = HashMap::with_capacity(files.len());
    let mut stale = Vec::new();
    let mut changed = cache.files.len() != files.len();
    for f in files {
        let Some(st) = stamp(&f) else { continue };
        match cache.files.remove(&f) {
            Some(e) if e.0 == st => {
                fresh.insert(f, e);
            }
            _ => stale.push((f, st)),
        }
    }
    changed |= !stale.is_empty();
    let next = AtomicUsize::new(0);
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8));
    let scanned: Vec<(PathBuf, (Stamp, String, FileRuns))> = std::thread::scope(|s| {
        let workers: Vec<_> = (0..threads)
            .map(|_| {
                s.spawn(|| {
                    let mut done = Vec::new();
                    while let Some((f, st)) = stale.get(next.fetch_add(1, Ordering::Relaxed)) {
                        let slug = f
                            .strip_prefix(projects_dir)
                            .ok()
                            .and_then(|r| r.components().next())
                            .map(|c| c.as_os_str().to_string_lossy().into_owned())
                            .unwrap_or_default();
                        done.push((f.clone(), (*st, slug, scan_file(f))));
                    }
                    done
                })
            })
            .collect();
        workers
            .into_iter()
            .flat_map(|w| w.join().unwrap_or_default())
            .collect()
    });
    fresh.extend(scanned);
    cache.files = fresh;
    cache.v = CACHE_V;
    if changed {
        if let (Some(file), Ok(bytes)) = (cache_file, serde_json::to_vec(&*cache)) {
            if let Some(dir) = file.parent() {
                let _ = fs::create_dir_all(dir);
            }
            let tmp = file.with_extension("tmp");
            if fs::write(&tmp, bytes).is_ok() {
                let _ = fs::rename(&tmp, file);
            }
        }
    }
    let mut runs = Runs::default();
    for (_, slug, fr) in cache.files.values() {
        if let Some(first) = fr.first {
            runs.start = Some(runs.start.map_or(first, |s| s.min(first)));
        }
        for (k, t) in &fr.hits {
            let agg = runs.by_key.entry(k.clone()).or_default();
            agg.tally.merge(t);
            *agg.slugs.entry(slug.clone()).or_insert(0) += t.n;
        }
    }
    runs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(text: &str) -> impl Iterator<Item = String> + '_ {
        text.lines().map(str::to_string)
    }

    #[test]
    fn iso_parses_utc_millis() {
        assert_eq!(iso_ms("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(iso_ms("2026-10-28T16:48:09.225Z"), Some(1_793_206_089_225));
        assert_eq!(iso_ms("2000-03-01T00:00:01Z"), Some(951_868_801_000));
        assert_eq!(iso_ms("garbage"), None);
    }

    #[test]
    fn counts_every_kind_of_run() {
        let text = r#"{"type":"user","timestamp":"2026-10-01T10:00:00.000Z","message":{"content":"<command-name>/phase:next</command-name>"}}
{"type":"user","timestamp":"2026-10-01T10:00:01.000Z","message":{"content":[{"type":"text","text":"<command-name>/clear</command-name>"}]}}
not json "tool_use"
{"type":"assistant","timestamp":"2026-10-02T10:00:00.000Z","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"chisle:chisle-review"}},{"type":"tool_use","name":"Skill","input":{"skill":"Windows Apps/Sorter:speckit-tasks"}},{"type":"tool_use","name":"Agent","input":{"subagent_type":"adversary"}},{"type":"tool_use","name":"Task","input":{}},{"type":"tool_use","name":"mcp__chrome-devtools__click","input":{}},{"type":"tool_use","name":"mcp__plugin_claude-mem_mcp-search__find","input":{}},{"type":"tool_use","name":"Read","input":{}}]}}
{"type":"assistant","timestamp":"2026-10-03T10:00:00.000Z","message":{"content":[{"type":"tool_use","name":"mcp__chrome-devtools__fill","input":{}}]}}"#;
        let r = scan_lines(lines(text));
        let n = |k: &str| r.hits.get(k).map_or(0, |t| t.n);
        assert_eq!(n("c|phase:next"), 1);
        assert_eq!(n("c|clear"), 1);
        assert_eq!(n("s|chisle:chisle-review"), 1);
        assert_eq!(n("s|speckit-tasks"), 1);
        assert_eq!(n("a|adversary"), 1);
        assert_eq!(n("a|general-purpose"), 1);
        assert_eq!(n("m|chrome-devtools"), 2);
        assert_eq!(n("m|plugin_claude-mem_mcp-search"), 1);
        assert_eq!(r.hits.len(), 8);
        let chrome = &r.hits["m|chrome-devtools"];
        assert_eq!(chrome.last, iso_ms("2026-10-03T10:00:00.000Z").unwrap());
        assert_eq!(chrome.days.len(), 2);
        assert_eq!(r.first, iso_ms("2026-10-01T10:00:00.000Z"));
    }

    #[test]
    fn collect_caches_and_drops_deleted_files() {
        let dir = tempfile::tempdir().unwrap();
        let proj = dir.path().join("projects");
        let a = proj.join("C--P-Echo").join("s1.jsonl");
        let b = proj
            .join("C--P-Echo")
            .join("s1")
            .join("subagents")
            .join("x.jsonl");
        fs::create_dir_all(b.parent().unwrap()).unwrap();
        let line = r#"{"type":"assistant","timestamp":"2026-10-02T10:00:00.000Z","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"jira"}}]}}"#;
        fs::write(&a, line).unwrap();
        fs::write(&b, line).unwrap();
        let cache = dir.path().join("cache.json");
        *CACHE.lock().unwrap() = None;
        let r = collect(&proj, Some(&cache));
        assert_eq!(r.by_key["s|jira"].tally.n, 2);
        assert_eq!(r.by_key["s|jira"].slugs["C--P-Echo"], 2);
        assert!(cache.is_file());
        fs::remove_file(&b).unwrap();
        *CACHE.lock().unwrap() = None;
        let r = collect(&proj, Some(&cache));
        assert_eq!(r.by_key["s|jira"].tally.n, 1);
    }
}
