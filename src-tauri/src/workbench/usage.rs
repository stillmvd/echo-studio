use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;

use super::projects::{place_for, places, ProjectTree};
use crate::conversations::reader::jsonl_lines;

const DAYS: i64 = 7;
const DAY: i64 = 86_400;
const SCAN: Duration = Duration::from_secs(8 * 86_400);

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub week: u64,
    pub today: u64,
    pub sessions: u32,
    pub days: BTreeMap<String, u64>,
    pub today_weight: u64,
    pub today_cache_read: u64,
    pub today_sessions: u32,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DayTokens {
    pub date: String,
    pub input: u64,
    pub output: u64,
    pub cache_write: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ModelTokens {
    pub model: String,
    pub tokens: u64,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub week: u64,
    pub today: u64,
    pub cache_read: u64,
    pub today_cache_read: u64,
    pub sub: u64,
    pub days: Vec<DayTokens>,
    pub models: Vec<ModelTokens>,
    pub hours: Vec<u64>,
    pub today_weight: u64,
    pub window_weight: u64,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct Report {
    pub projects: HashMap<String, Usage>,
    pub summary: Summary,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Entry {
    pub id: Option<String>,
    pub at: i64,
    pub model: String,
    pub input: u64,
    pub output: u64,
    pub cache_write: u64,
    pub cache_read: u64,
}

impl Entry {
    fn tokens(&self) -> u64 {
        self.input + self.output + self.cache_write
    }

    fn weight(&self) -> u64 {
        self.input * 20 + self.cache_write * 25 + self.cache_read * 2 + self.output * 100
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct FileUsage {
    pub cwd: Option<String>,
    pub sub: bool,
    pub entries: Vec<Entry>,
}

type Stamp = (SystemTime, u64);

static CACHE: LazyLock<Mutex<HashMap<PathBuf, (Stamp, FileUsage)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn secs(t: SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

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
        let (Some(u), Some(at)) = (
            j.pointer("/message/usage"),
            j.get("timestamp")
                .and_then(Value::as_str)
                .and_then(|ts| humantime::parse_rfc3339_weak(ts).ok()),
        ) else {
            continue;
        };
        let model = j
            .pointer("/message/model")
            .and_then(Value::as_str)
            .unwrap_or("");
        if model == "<synthetic>" {
            continue;
        }
        let id = j.pointer("/message/id").and_then(Value::as_str).map(|id| {
            let request = j.get("requestId").and_then(Value::as_str).unwrap_or("");
            format!("{id}:{request}")
        });
        if let Some(id) = &id {
            if !seen.insert(id.clone()) {
                continue;
            }
        }
        let n = |k: &str| u.get(k).and_then(Value::as_u64).unwrap_or(0);
        out.entries.push(Entry {
            id,
            at: secs(at),
            model: model.to_owned(),
            input: n("input_tokens"),
            output: n("output_tokens"),
            cache_write: n("cache_creation_input_tokens"),
            cache_read: n("cache_read_input_tokens"),
        });
    }
    out
}

fn add(into: &mut Usage, from: Usage) {
    into.week += from.week;
    into.today += from.today;
    into.sessions += from.sessions;
    into.today_weight += from.today_weight;
    into.today_cache_read += from.today_cache_read;
    into.today_sessions += from.today_sessions;
    for (day, tokens) in from.days {
        *into.days.entry(day).or_default() += tokens;
    }
}

fn civil(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

pub fn aggregate<'a>(
    files: impl Iterator<Item = &'a FileUsage>,
    now: i64,
    offset: i64,
    window_start: Option<i64>,
) -> (HashMap<String, Usage>, Summary) {
    let today = (now + offset).div_euclid(DAY);
    let first = today - (DAYS - 1);
    let mut days: Vec<DayTokens> = (first..=today)
        .map(|d| DayTokens {
            date: civil(d),
            ..DayTokens::default()
        })
        .collect();
    let mut models: HashMap<&str, u64> = HashMap::new();
    let mut summary = Summary {
        hours: vec![0; 24],
        ..Summary::default()
    };
    let mut seen: HashSet<&str> = HashSet::new();
    let mut raw: HashMap<String, Usage> = HashMap::new();
    for file in files {
        let mut usage = Usage::default();
        for e in &file.entries {
            let local = e.at + offset;
            let day = local.div_euclid(DAY);
            if e.id.as_deref().is_some_and(|id| !seen.insert(id)) {
                continue;
            }
            let in_window = window_start.is_none_or(|start| e.at >= start);
            if window_start.is_some() && in_window && e.at <= now {
                summary.window_weight += e.weight();
            }
            if day < first || day > today {
                continue;
            }
            let tokens = e.tokens();
            let slot = &mut days[(day - first) as usize];
            slot.input += e.input;
            slot.output += e.output;
            slot.cache_write += e.cache_write;
            summary.week += tokens;
            summary.cache_read += e.cache_read;
            if file.sub {
                summary.sub += tokens;
            }
            if day == today {
                summary.today += tokens;
                summary.today_cache_read += e.cache_read;
                usage.today += tokens;
                usage.today_cache_read += e.cache_read;
                if in_window {
                    summary.today_weight += e.weight();
                    usage.today_weight += e.weight();
                }
            }
            if now - e.at < DAY {
                summary.hours[local.rem_euclid(DAY) as usize / 3600] += tokens;
            }
            if !e.model.is_empty() {
                *models.entry(&e.model).or_default() += tokens;
            }
            usage.week += tokens;
            *usage.days.entry(civil(day)).or_default() += tokens;
        }
        if let (Some(cwd), false) = (&file.cwd, usage.days.is_empty()) {
            usage.sessions = u32::from(!file.sub);
            usage.today_sessions = u32::from(!file.sub && usage.today_weight > 0);
            add(raw.entry(cwd.clone()).or_default(), usage);
        }
    }
    summary.days = days;
    summary.models = models
        .into_iter()
        .map(|(model, tokens)| ModelTokens {
            model: model.to_owned(),
            tokens,
        })
        .collect();
    summary
        .models
        .sort_by(|a, b| b.tokens.cmp(&a.tokens).then_with(|| a.model.cmp(&b.model)));
    (raw, summary)
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

fn slug_of(transcript: &Path, sub: bool) -> Option<String> {
    let up = if sub { 3 } else { 1 };
    transcript
        .ancestors()
        .nth(up)?
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
}

fn jsonl(dir: &Path, cutoff: SystemTime, sub: bool, out: &mut Vec<(PathBuf, Stamp, bool)>) {
    let Ok(it) = std::fs::read_dir(dir) else {
        return;
    };
    for f in it.filter_map(Result::ok) {
        let path = f.path();
        let Ok(meta) = f.metadata() else { continue };
        if meta.is_dir() {
            if !sub {
                jsonl(&path.join("subagents"), cutoff, true, out);
            }
            continue;
        }
        let Ok(mtime) = meta.modified() else { continue };
        if path.extension().is_some_and(|e| e == "jsonl") && mtime >= cutoff {
            out.push((path, (mtime, meta.len()), sub));
        }
    }
}

fn transcripts(base: &Path, cutoff: SystemTime) -> Vec<(PathBuf, Stamp, bool)> {
    let mut out = Vec::new();
    if let Ok(dirs) = std::fs::read_dir(base) {
        for d in dirs.filter_map(Result::ok) {
            jsonl(&d.path(), cutoff, false, &mut out);
        }
    }
    out
}

pub fn read_usage(tree: &ProjectTree, offset_minutes: i32, window_start: Option<i64>) -> Report {
    let Some(base) = dirs::home_dir().map(|h| h.join(".claude").join("projects")) else {
        return Report::default();
    };
    let now = SystemTime::now();
    let files = transcripts(&base, now - SCAN);
    let live: HashSet<&PathBuf> = files.iter().map(|(p, _, _)| p).collect();
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    cache.retain(|p, _| live.contains(p));
    for (path, stamp, sub) in &files {
        if cache.get(path).is_some_and(|(s, _)| s == stamp) {
            continue;
        }
        let Ok(file) = File::open(path) else { continue };
        let mut usage = scan_lines(jsonl_lines(BufReader::new(file)));
        usage.sub = *sub;
        if usage.cwd.is_none() {
            usage.cwd = slug_of(path, *sub);
        }
        cache.insert(path.clone(), (*stamp, usage));
    }
    let mut ordered: Vec<(&PathBuf, &FileUsage)> = cache.iter().map(|(p, (_, f))| (p, f)).collect();
    ordered.sort_by_key(|(p, f)| (f.sub, *p));
    let (raw, summary) = aggregate(
        ordered.into_iter().map(|(_, f)| f),
        secs(now),
        i64::from(offset_minutes) * 60,
        window_start,
    );
    let projects = by_project(raw, |cwd| {
        place_for(tree, cwd)
            .or_else(|| places(tree).find(|p| claude_slug(&p.path) == cwd))
            .map(|p| p.path.clone())
    });
    Report { projects, summary }
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
{"type":"assistant","requestId":"r1","timestamp":"2026-10-20T10:00:01.000Z","message":{"id":"m1","model":"claude-opus-5-5","usage":{"input_tokens":10,"output_tokens":5,"cache_creation_input_tokens":100,"cache_read_input_tokens":9999}}}
{"type":"assistant","requestId":"r1","timestamp":"2026-10-20T10:00:02.000Z","message":{"id":"m1","model":"claude-opus-5-5","usage":{"input_tokens":10,"output_tokens":5,"cache_creation_input_tokens":100}}}
not json
{"type":"assistant","requestId":"r2","timestamp":"2026-10-19T09:00:00.000Z","message":{"id":"m2","model":"claude-haiku-5-5","usage":{"input_tokens":1,"output_tokens":2}}}
{"type":"assistant","timestamp":"2026-10-19T09:30:00.000Z","message":{"id":"m9","model":"<synthetic>","usage":{"input_tokens":50}}}
{"type":"assistant","requestId":"r3","timestamp":"2026-10-01T09:00:00.000Z","message":{"id":"m3","model":"claude-opus-5-5","usage":{"input_tokens":1000}}}"#;

    const NOW: i64 = 1_793_016_000;

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
        assert_eq!(
            slug_of(path, false).as_deref(),
            Some("C--Users-me-Projects")
        );
        let sub =
            Path::new(r"C:\Users\me\.claude\projects\C--Users-me-Projects\s\subagents\a.jsonl");
        assert_eq!(slug_of(sub, true).as_deref(), Some("C--Users-me-Projects"));
    }

    #[test]
    fn scan_dedups_streaming_and_skips_synthetic() {
        let usage = scan_lines(lines(TRANSCRIPT));
        assert_eq!(
            usage.cwd.as_deref(),
            Some(r"C:\Users\me\Projects\Freelance\AM 2.0\apps\api")
        );
        let tokens: Vec<u64> = usage.entries.iter().map(Entry::tokens).collect();
        assert_eq!(tokens, vec![115, 3, 1000]);
        assert_eq!(usage.entries[0].cache_read, 9999);
        assert_eq!(usage.entries[0].id.as_deref(), Some("m1:r1"));
        assert_eq!(usage.entries[1].model, "claude-haiku-5-5");
    }

    #[test]
    fn civil_turns_day_numbers_into_dates() {
        assert_eq!(civil(0), "1970-01-01");
        assert_eq!(civil(NOW / DAY), "2026-10-26");
    }

    #[test]
    fn aggregate_counts_week_today_days_models_and_sessions() {
        let file = scan_lines(lines(TRANSCRIPT));
        let mut copy = scan_lines(lines(TRANSCRIPT));
        copy.cwd = Some("C:\\copy".into());
        let old = FileUsage {
            cwd: Some("C:\\x".into()),
            entries: vec![Entry {
                at: NOW - 30 * DAY,
                input: 7,
                ..Entry::default()
            }],
            ..FileUsage::default()
        };
        let now = 1_792_497_600;
        let (raw, s) = aggregate([&file, &copy, &old].into_iter(), now, 0, None);
        let api = &raw[r"C:\Users\me\Projects\Freelance\AM 2.0\apps\api"];
        assert_eq!(api.week, 118);
        assert_eq!(api.today, 115);
        assert_eq!(api.sessions, 1);
        assert_eq!(api.days.get("2026-10-19"), Some(&3));
        assert!(!raw.contains_key("C:\\copy"));
        assert!(!raw.contains_key("C:\\x"));
        assert_eq!(s.week, 118);
        assert_eq!(s.today, 115);
        assert_eq!(s.cache_read, 9999);
        assert_eq!(s.days.len(), 7);
        assert_eq!(s.days[6].date, "2026-10-20");
        assert_eq!(s.days[6].cache_write, 100);
        assert_eq!(s.models[0].model, "claude-opus-5-5");
        assert_eq!(s.models[0].tokens, 115);
        assert_eq!(s.hours[10], 115);
    }

    #[test]
    fn aggregate_shifts_days_by_local_offset_and_counts_subagents() {
        let mut sub = FileUsage {
            cwd: Some("C:\\p".into()),
            sub: true,
            entries: vec![Entry {
                id: Some("a".into()),
                at: NOW - 13 * 3600 - 1800,
                output: 10,
                ..Entry::default()
            }],
        };
        let (raw, s) = aggregate([&sub].into_iter(), NOW, 3 * 3600, None);
        assert_eq!(raw["C:\\p"].sessions, 0);
        assert_eq!(s.sub, 10);
        assert_eq!(s.today, 10);
        assert_eq!(s.days[6].date, "2026-10-26");
        assert_eq!(s.hours[1], 10);
        let (_, s) = aggregate([&sub].into_iter(), NOW, 0, None);
        assert_eq!(s.today, 0);
        sub.entries[0].at = NOW - 16 * 3600;
        let (_, s) = aggregate([&sub].into_iter(), NOW, 3 * 3600, None);
        assert_eq!(s.days[5].output, 10);
        assert_eq!(s.today, 0);
    }

    #[test]
    fn aggregate_weighs_today_and_week_window_by_price() {
        let entry = |id: &str, at: i64| Entry {
            id: Some(id.into()),
            at,
            input: 10,
            output: 1,
            cache_write: 4,
            cache_read: 100,
            ..Entry::default()
        };
        let main = FileUsage {
            cwd: Some("C:\\p".into()),
            entries: vec![
                entry("a", NOW - 3600),
                entry("b", NOW - 2 * DAY),
                entry("c", NOW - 8 * DAY),
            ],
            ..FileUsage::default()
        };
        let sub = FileUsage {
            cwd: Some("C:\\p".into()),
            sub: true,
            entries: vec![entry("d", NOW - 1800)],
        };
        let (raw, s) = aggregate(
            [&main, &sub].into_iter(),
            NOW,
            0,
            Some(NOW - 7 * DAY - 3600),
        );
        let w = 10 * 20 + 4 * 25 + 100 * 2 + 100;
        assert_eq!(s.today_weight, 2 * w);
        assert_eq!(s.window_weight, 3 * w);
        assert_eq!(raw["C:\\p"].today_weight, 2 * w);
        assert_eq!(raw["C:\\p"].today_cache_read, 200);
        assert_eq!(raw["C:\\p"].today_sessions, 1);
        let (_, s) = aggregate([&main].into_iter(), NOW, 0, None);
        assert_eq!(s.window_weight, 0);
        assert_eq!(s.today_weight, w);
        let (_, s) = aggregate([&main].into_iter(), NOW, 0, Some(NOW - 1800));
        assert_eq!(s.today_weight, 0);
        assert_eq!(s.today, 15);
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
                ..Usage::default()
            },
        );
        raw.insert(
            "P\\AM\\apps\\web".to_owned(),
            Usage {
                week: 3,
                today: 0,
                sessions: 2,
                days: BTreeMap::from([("d".into(), 3)]),
                ..Usage::default()
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
