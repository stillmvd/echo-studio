use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde_json::Value;

use super::{
    field, field_list, field_str, MemoryHit, MemoryListing, MemoryProject, MemoryRecord,
    SessionNote, ARCHIVE_DIR, INDEX_FILE, MEMORY_DIR, SESSIONS_DIR,
};
use crate::conversations::paths::display_name;
use crate::tooling::frontmatter::parse;

const HIT_LIMIT: usize = 200;
const SNIPPET: usize = 200;

fn md_files(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().and_then(|e| e.to_str()) == Some("md"))
        .collect();
    files.sort();
    files
}

fn record_files(dir: &Path) -> Vec<PathBuf> {
    md_files(dir)
        .into_iter()
        .filter(|p| p.file_name().and_then(|n| n.to_str()) != Some(INDEX_FILE))
        .collect()
}

fn mtime(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs())
}

fn iso(secs: u64) -> String {
    humantime::format_rfc3339_seconds(UNIX_EPOCH + std::time::Duration::from_secs(secs)).to_string()
}

fn file_stem(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn read_record(path: &Path, archived: bool) -> MemoryRecord {
    let file = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut record = MemoryRecord {
        path: path.to_string_lossy().into_owned(),
        file,
        name: file_stem(path),
        description: String::new(),
        kind_type: None,
        kind: None,
        status: "observation".into(),
        seen: 1,
        importance: 2,
        tags: Vec::new(),
        files: Vec::new(),
        supersedes: None,
        valid_to: None,
        consolidated_into: None,
        stale: false,
        updated: iso(mtime(path)),
        archived,
        body_chars: 0,
        error: None,
    };
    let text = match fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) => {
            record.error = Some(format!("read: {e}"));
            return record;
        }
    };
    let parsed = match parse(&text) {
        Ok(p) => p,
        Err(e) => {
            record.error = Some(e);
            return record;
        }
    };
    record.body_chars = parsed.body.trim().chars().count();
    let f = &parsed.fields;
    if let Some(name) = field_str(f, "name") {
        record.name = name;
    }
    record.description = field_str(f, "description").unwrap_or_default();
    record.kind_type = field_str(f, "type");
    record.kind = field_str(f, "kind");
    if field_str(f, "status").as_deref() == Some("fact") {
        record.status = "fact".into();
    }
    if let Some(n) = field(f, "seen").and_then(Value::as_u64) {
        record.seen = n.max(1) as u32;
    }
    if let Some(n) = field(f, "importance").and_then(Value::as_u64) {
        record.importance = n.clamp(1, 3) as u8;
    }
    record.tags = field_list(f, "tags");
    record.files = field_list(f, "files");
    record.supersedes = field_str(f, "supersedes");
    record.valid_to = field_str(f, "valid_to");
    record.consolidated_into = field_str(f, "consolidated_into");
    if let Some(updated) = field_str(f, "updated") {
        record.updated = updated;
    }
    record
}

fn next_step(body: &str) -> Option<String> {
    let mut inside = false;
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("## ") {
            inside = trimmed.starts_with("## Дальше");
            continue;
        }
        if inside {
            let text = trimmed.trim_start_matches(['-', '*']).trim();
            if !text.is_empty() && text != "—" && text != "-" {
                return Some(text.chars().take(160).collect());
            }
        }
    }
    None
}

pub fn read_session(path: &Path) -> SessionNote {
    let mut note = SessionNote {
        path: path.to_string_lossy().into_owned(),
        session_id: None,
        title: file_stem(path),
        capture: "claude".into(),
        updated: iso(mtime(path)),
        next: None,
        error: None,
    };
    match fs::read_to_string(path)
        .map_err(|e| format!("read: {e}"))
        .and_then(|t| parse(&t))
    {
        Ok(parsed) => {
            let f = &parsed.fields;
            note.session_id = field_str(f, "session_id");
            if let Some(title) = field_str(f, "description").or_else(|| field_str(f, "title")) {
                note.title = title;
            }
            if let Some(capture) = field_str(f, "capture") {
                note.capture = capture;
            }
            if let Some(updated) = field_str(f, "updated") {
                note.updated = updated;
            }
            note.next = next_step(&parsed.body);
        }
        Err(e) => note.error = Some(e),
    }
    note
}

pub fn index_lines(dir: &Path) -> usize {
    fs::read_to_string(dir.join(INDEX_FILE)).map_or(0, |t| t.lines().count())
}

fn today() -> String {
    humantime::format_rfc3339_seconds(std::time::SystemTime::now()).to_string()[..10].to_string()
}

pub fn list(dir: &Path) -> MemoryListing {
    let mut records: Vec<MemoryRecord> = record_files(dir)
        .iter()
        .map(|p| read_record(p, false))
        .collect();
    let superseded: HashSet<String> = records
        .iter()
        .filter_map(|r| r.supersedes.clone())
        .collect();
    let today = today();
    for r in &mut records {
        r.stale = superseded.contains(&r.name)
            || r.valid_to.as_deref().is_some_and(|v| v <= today.as_str());
    }
    let mut sessions: Vec<SessionNote> = md_files(&dir.join(SESSIONS_DIR))
        .iter()
        .map(|p| read_session(p))
        .collect();
    sessions.sort_by(|a, b| b.updated.cmp(&a.updated));
    let archived = md_files(&dir.join(ARCHIVE_DIR))
        .iter()
        .map(|p| read_record(p, true))
        .collect();
    MemoryListing {
        records,
        sessions,
        archived,
        index_lines: index_lines(dir),
    }
}

pub fn memory_dirs(root: &Path) -> Vec<(String, PathBuf)> {
    let mut out: Vec<(String, PathBuf)> = fs::read_dir(root)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let dir = e.path().join(MEMORY_DIR);
            dir.is_dir()
                .then(|| (e.file_name().to_string_lossy().into_owned(), dir))
        })
        .collect();
    out.sort();
    out
}

fn newest_mtime(dir: &Path) -> u64 {
    [dir.to_path_buf(), dir.join(SESSIONS_DIR)]
        .iter()
        .flat_map(|d| md_files(d))
        .map(|p| mtime(&p))
        .max()
        .unwrap_or_else(|| mtime(dir))
}

pub fn name_from_slug(slug: &str) -> String {
    let lower = slug.to_lowercase();
    let cut = ["-projects-", "-desktop-", "-documents-"]
        .iter()
        .filter_map(|m| lower.rfind(m).map(|i| i + m.len()))
        .max()
        .or_else(|| {
            let users = lower.find("--users-")? + "--users-".len();
            lower[users..].find('-').map(|i| users + i + 1)
        });
    match cut {
        Some(i) if i < slug.len() => slug[i..].to_string(),
        _ => slug.to_string(),
    }
}

pub fn list_projects(root: &Path, cwds: &HashMap<String, String>) -> Vec<MemoryProject> {
    let mut projects: Vec<MemoryProject> = memory_dirs(root)
        .into_iter()
        .map(|(slug, dir)| {
            let records: Vec<MemoryRecord> = record_files(&dir)
                .iter()
                .map(|p| read_record(p, false))
                .collect();
            let cwd = cwds.get(&slug).cloned();
            MemoryProject {
                name: cwd
                    .as_deref()
                    .map_or_else(|| name_from_slug(&slug), display_name),
                cwd,
                memory_dir: dir.to_string_lossy().into_owned(),
                facts: records.iter().filter(|r| r.status == "fact").count(),
                records: records.len(),
                sessions: md_files(&dir.join(SESSIONS_DIR)).len(),
                archived: md_files(&dir.join(ARCHIVE_DIR)).len(),
                index_lines: index_lines(&dir),
                updated_at: newest_mtime(&dir),
                slug,
            }
        })
        .collect();
    projects.sort_by_key(|p| std::cmp::Reverse(p.updated_at));
    projects
}

fn snippet(line: &str, at: usize) -> String {
    let chars: Vec<char> = line.chars().collect();
    let start = at.saturating_sub(SNIPPET / 3);
    chars
        .iter()
        .skip(start)
        .take(SNIPPET)
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn search(root: &Path, query: &str, slug: Option<&str>) -> Vec<MemoryHit> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Vec::new();
    }
    let mut hits = Vec::new();
    for (project, dir) in memory_dirs(root) {
        if slug.is_some_and(|s| s != project) {
            continue;
        }
        let files = md_files(&dir)
            .into_iter()
            .chain(md_files(&dir.join(SESSIONS_DIR)));
        for file in files {
            let Ok(text) = fs::read_to_string(&file) else {
                continue;
            };
            for (i, line) in text.lines().enumerate() {
                let lower = line.to_lowercase();
                if let Some(byte) = lower.find(&needle) {
                    hits.push(MemoryHit {
                        slug: project.clone(),
                        path: file.to_string_lossy().into_owned(),
                        line: i + 1,
                        snippet: snippet(line, lower[..byte].chars().count()),
                    });
                    if hits.len() >= HIT_LIMIT {
                        return hits;
                    }
                }
            }
        }
    }
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn lists_records_sessions_archive_and_broken_entries() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("C--p").join(MEMORY_DIR);
        write(&dir.join(INDEX_FILE), "- [a](a.md) — x\n");
        write(
            &dir.join("a.md"),
            "---\nname: a\ndescription: Запись А\nmetadata:\n  type: project\n  kind: gotcha\n  status: fact\n  seen: 2\n  files:\n    - src/a.ts\n---\nтело\n",
        );
        write(
            &dir.join("b.md"),
            "---\nname: b\ndescription: B\nmetadata:\n  supersedes: a\n  valid_to: 2000-01-01\n---\n",
        );
        write(&dir.join("broken.md"), "---\nfoo: [\n---\n");
        write(
            &dir.join(SESSIONS_DIR).join("2026-09-29_ab12cd34.md"),
            "---\nname: session-ab12cd34\ndescription: Итог\nmetadata:\n  session_id: ab12cd34-x\n  capture: extractive\n---\n## Дальше\n- стенд\n",
        );
        write(
            &dir.join(ARCHIVE_DIR).join("old.md"),
            "---\nname: old\n---\n",
        );
        let listing = list(&dir);
        assert_eq!(listing.records.len(), 3);
        let a = listing.records.iter().find(|r| r.name == "a").unwrap();
        assert_eq!(
            (a.status.as_str(), a.seen, a.kind.as_deref(), a.stale),
            ("fact", 2, Some("gotcha"), true)
        );
        assert_eq!(a.files, vec!["src/a.ts"]);
        let b = listing.records.iter().find(|r| r.name == "b").unwrap();
        assert!(b.stale);
        assert!(listing.records.iter().any(|r| r.error.is_some()));
        let s = &listing.sessions[0];
        assert_eq!(
            (s.title.as_str(), s.capture.as_str(), s.next.as_deref()),
            ("Итог", "extractive", Some("стенд"))
        );
        assert_eq!(listing.archived.len(), 1);
        assert_eq!(listing.index_lines, 1);

        let cwds = HashMap::from([("C--p".to_string(), "C:\\p".to_string())]);
        let projects = list_projects(root.path(), &cwds);
        assert_eq!(projects.len(), 1);
        assert_eq!((projects[0].name.as_str(), projects[0].facts), ("p", 1));
    }

    #[test]
    fn searches_by_substring_ignoring_case_and_archive() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("C--p").join(MEMORY_DIR);
        write(
            &dir.join("a.md"),
            "первая строка\nПро WikiLink и Кириллицу\n",
        );
        write(&dir.join(ARCHIVE_DIR).join("z.md"), "wikilink в архиве\n");
        let hits = search(root.path(), "wikilink", None);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line, 2);
        assert_eq!(search(root.path(), "кириллицу", Some("C--p")).len(), 1);
        assert!(search(root.path(), "кириллицу", Some("other")).is_empty());
        assert!(search(root.path(), "  ", None).is_empty());
    }

    #[test]
    fn readable_names_from_slugs() {
        assert_eq!(
            name_from_slug("C--Users-stillmvd-Projects-Atlant-Consult-agregation-messages"),
            "Atlant-Consult-agregation-messages"
        );
        assert_eq!(
            name_from_slug("c--Users-stillmvd-Projects-Windows-Apps-FOLDERIZE"),
            "Windows-Apps-FOLDERIZE"
        );
        assert_eq!(
            name_from_slug("C--Program-Files-Image-Line"),
            "C--Program-Files-Image-Line"
        );
        assert_eq!(name_from_slug("C--Users-stillmvd-Desktop"), "Desktop");
    }

    #[test]
    fn missing_folders_are_empty() {
        let root = tempfile::tempdir().unwrap();
        assert!(list_projects(&root.path().join("nope"), &HashMap::new()).is_empty());
        let listing = list(&root.path().join("nope"));
        assert!(listing.records.is_empty() && listing.sessions.is_empty());
    }
}
