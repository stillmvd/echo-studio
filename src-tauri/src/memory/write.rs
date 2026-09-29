use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

use serde_yaml::{Mapping, Value as YamlValue};

use super::index::{append_line, line_for, move_out_of_facts, move_to_facts, remove_links};
use super::scan::read_record;
use super::{MemoryRecord, RecordPatch, ARCHIVE_DIR, INDEX_FILE, MEMORY_DIR};
use crate::tooling::write::{backup, write_text_atomic};

pub struct Located {
    pub path: PathBuf,
    pub slug: String,
    pub dir: PathBuf,
    pub rest: Vec<String>,
}

fn plain(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    PathBuf::from(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string())
}

pub fn locate(path: &Path, root: &Path) -> Result<Located, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("cannot resolve {}: {e}", path.display()))?;
    let root = root
        .canonicalize()
        .map_err(|e| format!("cannot resolve {}: {e}", root.display()))?;
    let refuse = || {
        format!(
            "refusing: {} is outside Claude memory folders",
            path.display()
        )
    };
    let rel = canonical.strip_prefix(&root).map_err(|_| refuse())?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| match c {
            Component::Normal(s) => Ok(s.to_string_lossy().into_owned()),
            _ => Err(refuse()),
        })
        .collect::<Result<_, _>>()?;
    if parts.len() < 3 || parts[1] != MEMORY_DIR {
        return Err(refuse());
    }
    if canonical.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(format!("refusing: {} is not a .md file", path.display()));
    }
    Ok(Located {
        dir: plain(&root.join(&parts[0]).join(MEMORY_DIR)),
        slug: parts[0].clone(),
        rest: parts[2..].to_vec(),
        path: plain(&canonical),
    })
}

pub fn memory_dir(root: &Path, slug: &str) -> Result<PathBuf, String> {
    let valid = !slug.is_empty() && !slug.contains(['/', '\\']) && slug != "." && slug != "..";
    let dir = root.join(slug).join(MEMORY_DIR);
    if valid && dir.is_dir() {
        Ok(dir)
    } else {
        Err(format!("unknown memory project: {slug}"))
    }
}

fn unique(dir: &Path, file: &str) -> PathBuf {
    let path = dir.join(file);
    if !path.exists() {
        return path;
    }
    let stem = Path::new(file)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    (2..)
        .map(|n| dir.join(format!("{stem}-{n}.md")))
        .find(|p| !p.exists())
        .unwrap_or(path)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn safe_write(file: &Path, text: &str, backups: &Path) -> Result<(), String> {
    if file.exists() {
        backup(file, backups, SystemTime::now())?;
    }
    write_text_atomic(file, text)
}

pub fn update_index(
    dir: &Path,
    backups: &Path,
    change: impl FnOnce(&str) -> String,
) -> Result<(), String> {
    let file = dir.join(INDEX_FILE);
    let before = match fs::read_to_string(&file) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(format!("read {}: {e}", file.display())),
    };
    let after = change(&before);
    if after == before {
        return Ok(());
    }
    safe_write(&file, &after, backups)
}

fn index_line_of(dir: &Path, file: &str) -> Option<String> {
    fs::read_to_string(dir.join(INDEX_FILE)).ok().and_then(|t| {
        t.lines()
            .find(|l| l.contains(&format!("]({file})")))
            .map(|l| l.trim_end_matches('\r').to_string())
    })
}

fn record_line(record: &MemoryRecord) -> String {
    line_for(&record.name, &record.file, &record.description)
}

pub fn save_text(path: &Path, text: &str, root: &Path, backups: &Path) -> Result<PathBuf, String> {
    let at = locate(path, root)?;
    if at.rest.first().map(String::as_str) == Some(ARCHIVE_DIR) {
        return Err("archived records are read-only — restore first".into());
    }
    safe_write(&at.path, text, backups)?;
    Ok(at.path)
}

pub fn archive(path: &Path, root: &Path, backups: &Path) -> Result<PathBuf, String> {
    let at = locate(path, root)?;
    if at.rest.len() != 1 || at.rest[0] == INDEX_FILE {
        return Err("only records can be archived".into());
    }
    let archive = at.dir.join(ARCHIVE_DIR);
    fs::create_dir_all(&archive).map_err(|e| format!("create {}: {e}", archive.display()))?;
    let target = unique(&archive, &at.rest[0]);
    fs::rename(&at.path, &target).map_err(|e| format!("archive {}: {e}", at.path.display()))?;
    update_index(&at.dir, backups, |md| remove_links(md, &at.rest[0]))?;
    Ok(target)
}

pub fn restore(archived: &Path, root: &Path, backups: &Path) -> Result<MemoryRecord, String> {
    let at = locate(archived, root)?;
    if at.rest.len() != 2 || at.rest[0] != ARCHIVE_DIR {
        return Err("not an archived record".into());
    }
    let target = unique(&at.dir, &at.rest[1]);
    fs::rename(&at.path, &target).map_err(|e| format!("restore {}: {e}", at.path.display()))?;
    let record = read_record(&target, false);
    let line = record_line(&record);
    update_index(&at.dir, backups, |md| append_line(md, &line))?;
    Ok(record)
}

pub fn move_to(
    path: &Path,
    target_slug: &str,
    root: &Path,
    backups: &Path,
) -> Result<MemoryRecord, String> {
    let at = locate(path, root)?;
    if at.rest.len() != 1 || at.rest[0] == INDEX_FILE {
        return Err("only records can be moved".into());
    }
    let target_dir = memory_dir(root, target_slug)?;
    if target_slug == at.slug {
        return Err("the record is already in this project".into());
    }
    let text = fs::read_to_string(&at.path).map_err(|e| format!("read: {e}"))?;
    let target = unique(&target_dir, &at.rest[0]);
    write_text_atomic(&target, &text)?;
    let old_line = index_line_of(&at.dir, &at.rest[0]);
    backup(&at.path, backups, SystemTime::now())?;
    fs::remove_file(&at.path).map_err(|e| format!("remove {}: {e}", at.path.display()))?;
    update_index(&at.dir, backups, |md| remove_links(md, &at.rest[0]))?;
    let record = read_record(&target, false);
    let new_file = file_name(&target);
    let line = old_line
        .map(|l| l.replace(&format!("]({})", at.rest[0]), &format!("]({new_file})")))
        .unwrap_or_else(|| record_line(&record));
    update_index(&target_dir, backups, |md| append_line(md, &line))?;
    Ok(record)
}

struct Front {
    eol: &'static str,
    yaml: String,
    body: String,
}

fn split_front(text: &str) -> Front {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let mut lines = text.split_inclusive('\n');
    let no_front = || Front {
        eol,
        yaml: String::new(),
        body: text.to_string(),
    };
    if lines.next().map(str::trim_end) != Some("---") {
        return no_front();
    }
    let mut consumed = text.find('\n').map_or(text.len(), |i| i + 1);
    let mut yaml = String::new();
    for line in lines {
        consumed += line.len();
        if line.trim_end() == "---" {
            return Front {
                eol,
                yaml,
                body: text[consumed..].to_string(),
            };
        }
        yaml.push_str(line);
    }
    no_front()
}

fn edit_meta(text: &str, change: impl FnOnce(&mut Mapping)) -> Result<String, String> {
    let front = split_front(text);
    let mut map: Mapping = if front.yaml.trim().is_empty() {
        Mapping::new()
    } else {
        serde_yaml::from_str(&front.yaml)
            .map_err(|e| format!("frontmatter is broken, fix the text by hand: {e}"))?
    };
    let key = YamlValue::String("metadata".into());
    if !matches!(map.get(&key), Some(YamlValue::Mapping(_))) {
        map.insert(key.clone(), YamlValue::Mapping(Mapping::new()));
    }
    if let Some(YamlValue::Mapping(meta)) = map.get_mut(&key) {
        change(meta);
    }
    let yaml = serde_yaml::to_string(&map).map_err(|e| format!("serialize frontmatter: {e}"))?;
    let eol = front.eol;
    Ok(format!(
        "---{eol}{}---{eol}{}",
        yaml.replace('\n', eol),
        front.body
    ))
}

fn set(meta: &mut Mapping, key: &str, value: YamlValue) {
    meta.insert(YamlValue::String(key.into()), value);
}

fn set_opt(meta: &mut Mapping, key: &str, value: &Option<Option<String>>) {
    match value {
        Some(Some(v)) => set(meta, key, YamlValue::String(v.clone())),
        Some(None) => {
            meta.remove(YamlValue::String(key.into()));
        }
        None => {}
    }
}

fn strings(items: Vec<String>) -> YamlValue {
    YamlValue::Sequence(items.into_iter().map(YamlValue::String).collect())
}

fn is_pinned(r: &MemoryRecord) -> bool {
    r.status == "fact" || r.importance == 3
}

fn live_record(path: &Path, root: &Path) -> Result<Located, String> {
    let at = locate(path, root)?;
    if at.rest.len() != 1 || at.rest[0] == INDEX_FILE {
        return Err("only live records can be changed".into());
    }
    Ok(at)
}

pub fn patch(
    path: &Path,
    patch: &RecordPatch,
    root: &Path,
    backups: &Path,
) -> Result<MemoryRecord, String> {
    let at = live_record(path, root)?;
    let before = read_record(&at.path, false);
    let text = fs::read_to_string(&at.path).map_err(|e| format!("read: {e}"))?;
    let next = edit_meta(&text, |meta| {
        if let Some(status) = &patch.status {
            set(meta, "status", YamlValue::String(status.clone()));
        }
        if let Some(importance) = patch.importance {
            set(
                meta,
                "importance",
                YamlValue::Number(importance.clamp(1, 3).into()),
            );
        }
        set_opt(meta, "valid_to", &patch.valid_to);
        set_opt(meta, "supersedes", &patch.supersedes);
    })?;
    safe_write(&at.path, &next, backups)?;
    let after = read_record(&at.path, false);
    let file = at.rest[0].clone();
    if is_pinned(&after) {
        let line = record_line(&after);
        update_index(&at.dir, backups, |md| move_to_facts(md, &file, &line))?;
    } else if is_pinned(&before) {
        update_index(&at.dir, backups, |md| move_out_of_facts(md, &file))?;
    }
    Ok(after)
}

fn union(into: &mut Vec<String>, more: &[String]) {
    for item in more {
        if !into.contains(item) {
            into.push(item.clone());
        }
    }
}

pub fn merge(
    canonical: &Path,
    absorbed: &[PathBuf],
    root: &Path,
    backups: &Path,
) -> Result<MemoryRecord, String> {
    let main = live_record(canonical, root)?;
    let others = absorbed
        .iter()
        .map(|p| live_record(p, root))
        .collect::<Result<Vec<_>, _>>()?;
    if others.is_empty() {
        return Err("nothing to merge".into());
    }
    if others
        .iter()
        .any(|o| o.dir != main.dir || o.path == main.path)
    {
        return Err("records must be different files of one project".into());
    }
    let canon = read_record(&main.path, false);
    let mut text = fs::read_to_string(&main.path).map_err(|e| format!("read: {e}"))?;
    let eol = split_front(&text).eol;
    let today = humantime::format_rfc3339_seconds(SystemTime::now()).to_string()[..10].to_string();
    let (mut tags, mut files) = (canon.tags.clone(), canon.files.clone());
    let (mut seen, mut importance) = (canon.seen, canon.importance);
    for other in &others {
        let rec = read_record(&other.path, false);
        let body =
            split_front(&fs::read_to_string(&other.path).map_err(|e| format!("read: {e}"))?).body;
        text = format!(
            "{}{eol}{eol}---{eol}Merged from {} ({today}):{eol}{eol}{}{eol}",
            text.trim_end(),
            rec.name,
            body.trim()
        );
        union(&mut tags, &rec.tags);
        union(&mut files, &rec.files);
        seen += rec.seen;
        importance = importance.max(rec.importance);
    }
    let merged = edit_meta(&text, |meta| {
        set(meta, "seen", YamlValue::Number(seen.into()));
        set(meta, "importance", YamlValue::Number(importance.into()));
        if !tags.is_empty() {
            set(meta, "tags", strings(tags));
        }
        if !files.is_empty() {
            set(meta, "files", strings(files));
        }
    })?;
    safe_write(&main.path, &merged, backups)?;
    for other in &others {
        let text = fs::read_to_string(&other.path).map_err(|e| format!("read: {e}"))?;
        let marked = edit_meta(&text, |meta| {
            set(
                meta,
                "consolidated_into",
                YamlValue::String(canon.name.clone()),
            );
        })?;
        safe_write(&other.path, &marked, backups)?;
        archive(&other.path, root, backups)?;
    }
    Ok(read_record(&main.path, false))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Env {
        _tmp: tempfile::TempDir,
        root: PathBuf,
        backups: PathBuf,
    }

    fn env() -> Env {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("projects");
        for slug in ["C--a", "C--b"] {
            fs::create_dir_all(root.join(slug).join(MEMORY_DIR)).unwrap();
        }
        fs::write(
            root.join("C--a").join(MEMORY_DIR).join(INDEX_FILE),
            "- [Грабли](g.md) — про грабли\n- [Другое](o.md) — x\n",
        )
        .unwrap();
        fs::write(
            root.join("C--a").join(MEMORY_DIR).join("g.md"),
            "---\nname: g\ndescription: про грабли\n---\nтело\n",
        )
        .unwrap();
        Env {
            backups: tmp.path().join("backups"),
            root,
            _tmp: tmp,
        }
    }

    fn read(p: PathBuf) -> String {
        fs::read_to_string(p).unwrap()
    }

    #[test]
    fn archive_and_restore_round_trip() {
        let e = env();
        let dir = e.root.join("C--a").join(MEMORY_DIR);
        let archived = archive(&dir.join("g.md"), &e.root, &e.backups).unwrap();
        assert!(!dir.join("g.md").exists() && archived.exists());
        assert_eq!(read(dir.join(INDEX_FILE)), "- [Другое](o.md) — x\n");
        let record = restore(&archived, &e.root, &e.backups).unwrap();
        assert_eq!(record.file, "g.md");
        assert!(dir.join("g.md").exists() && !archived.exists());
        assert!(read(dir.join(INDEX_FILE)).contains("- [g](g.md) — про грабли"));
        assert!(e.backups.exists());
    }

    #[test]
    fn move_keeps_the_index_line_and_renames_on_collision() {
        let e = env();
        let a = e.root.join("C--a").join(MEMORY_DIR);
        let b = e.root.join("C--b").join(MEMORY_DIR);
        fs::write(b.join("g.md"), "occupied").unwrap();
        let record = move_to(&a.join("g.md"), "C--b", &e.root, &e.backups).unwrap();
        assert_eq!(record.file, "g-2.md");
        assert!(!a.join("g.md").exists());
        assert!(!read(a.join(INDEX_FILE)).contains("g.md"));
        assert_eq!(
            read(b.join(INDEX_FILE)),
            "- [Грабли](g-2.md) — про грабли\n"
        );
        assert!(move_to(&b.join("g-2.md"), "C--missing", &e.root, &e.backups).is_err());
    }

    #[test]
    fn save_backs_up_and_refuses_foreign_paths() {
        let e = env();
        let file = e.root.join("C--a").join(MEMORY_DIR).join("g.md");
        save_text(&file, "новый текст", &e.root, &e.backups).unwrap();
        assert_eq!(read(file), "новый текст");
        let outside = e.root.join("C--a").join("session.md");
        fs::write(&outside, "x").unwrap();
        assert!(save_text(&outside, "y", &e.root, &e.backups).is_err());
        let json = e.root.join("C--a").join(MEMORY_DIR).join("x.json");
        fs::write(&json, "{}").unwrap();
        assert!(save_text(&json, "y", &e.root, &e.backups).is_err());
        assert!(memory_dir(&e.root, "..").is_err());
    }

    #[test]
    fn patch_keeps_order_and_moves_the_index_line() {
        let e = env();
        let dir = e.root.join("C--a").join(MEMORY_DIR);
        fs::write(
            dir.join("g.md"),
            "---\r\nname: g\r\ndescription: про грабли\r\nmetadata:\r\n  node_type: memory\r\n  custom: 1\r\n  valid_to: 2030-01-01\r\n---\r\nтело\r\n",
        )
        .unwrap();
        let pin = RecordPatch {
            status: Some("fact".into()),
            valid_to: Some(None),
            ..Default::default()
        };
        let r = patch(&dir.join("g.md"), &pin, &e.root, &e.backups).unwrap();
        assert_eq!((r.status.as_str(), r.valid_to.as_deref()), ("fact", None));
        let text = read(dir.join("g.md"));
        assert!(text.starts_with("---\r\nname: g\r\ndescription: про грабли\r\nmetadata:\r\n  node_type: memory\r\n  custom: 1\r\n  status: fact\r\n---\r\nтело\r\n"));
        assert!(read(dir.join(INDEX_FILE)).starts_with("## Факты\n- [Грабли](g.md)"));
        let back = RecordPatch {
            status: Some("observation".into()),
            ..Default::default()
        };
        patch(&dir.join("g.md"), &back, &e.root, &e.backups).unwrap();
        assert!(!read(dir.join(INDEX_FILE)).contains("## Факты"));
    }

    #[test]
    fn merge_appends_bodies_unions_fields_and_archives() {
        let e = env();
        let dir = e.root.join("C--a").join(MEMORY_DIR);
        fs::write(
            dir.join("g.md"),
            "---\nname: g\ndescription: про грабли\nmetadata:\n  seen: 1\n  importance: 2\n  tags: [a]\n---\nпервое\n",
        )
        .unwrap();
        fs::write(
            dir.join("o.md"),
            "---\nname: o\ndescription: о граблях\nmetadata:\n  seen: 2\n  importance: 3\n  tags: [a, b]\n  files: [src/x.ts]\n---\nвторое\n",
        )
        .unwrap();
        let r = merge(&dir.join("g.md"), &[dir.join("o.md")], &e.root, &e.backups).unwrap();
        assert_eq!((r.seen, r.importance), (3, 3));
        assert_eq!(
            (r.tags.clone(), r.files.clone()),
            (vec!["a".into(), "b".into()], vec!["src/x.ts".to_string()])
        );
        let text = read(dir.join("g.md"));
        assert!(
            text.contains("первое\n\n---\nMerged from o (") && text.trim_end().ends_with("второе")
        );
        let archived = dir.join(ARCHIVE_DIR).join("o.md");
        assert_eq!(
            read_record(&archived, true).consolidated_into.as_deref(),
            Some("g")
        );
        assert!(!read(dir.join(INDEX_FILE)).contains("o.md"));
        assert!(merge(&dir.join("g.md"), &[dir.join("g.md")], &e.root, &e.backups).is_err());
    }
}
