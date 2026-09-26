use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::paths::{claude_dir, claude_json, normalize_project, same_project};
use super::settings::read_json;
use super::{ToggleFile, ToggleKey, ToggleTarget};

const KEEP: usize = 20;
const SOURCE_FILE: &str = "source.txt";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigBackup {
    pub file: String,
    pub backup_path: String,
    pub created_at: String,
    pub size_bytes: u64,
}

pub fn target_file(home: &Path, t: &ToggleTarget, known: &[String]) -> Result<PathBuf, String> {
    let project = match &t.project_path {
        Some(p) if known.iter().any(|k| same_project(k, p)) => Some(normalize_project(p)),
        Some(p) => return Err(format!("unknown project: {p}")),
        None => None,
    };
    let allowed = match t.file {
        ToggleFile::UserSettings => {
            project.is_none()
                && matches!(t.key, ToggleKey::EnabledPlugins | ToggleKey::SkillOverrides)
        }
        ToggleFile::ProjectLocalSettings => {
            project.is_some()
                && matches!(
                    t.key,
                    ToggleKey::EnabledPlugins
                        | ToggleKey::SkillOverrides
                        | ToggleKey::DisabledMcpjsonServers
                )
        }
        ToggleFile::ClaudeJson => t.key == ToggleKey::DisabledMcpServers,
    };
    if !allowed || t.name.trim().is_empty() {
        return Err(format!(
            "refusing: {:?} cannot be written to {:?}",
            t.key, t.file
        ));
    }
    Ok(match t.file {
        ToggleFile::UserSettings => claude_dir(home).join("settings.json"),
        ToggleFile::ProjectLocalSettings => PathBuf::from(project.unwrap_or_default())
            .join(".claude")
            .join("settings.local.json"),
        ToggleFile::ClaudeJson => claude_json(home),
    })
}

fn object_at<'a>(
    obj: &'a mut Map<String, Value>,
    key: &str,
) -> Result<&'a mut Map<String, Value>, String> {
    obj.entry(key.to_string())
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| format!("{key} is not an object"))
}

fn array_at<'a>(obj: &'a mut Map<String, Value>, key: &str) -> Result<&'a mut Vec<Value>, String> {
    obj.entry(key.to_string())
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or_else(|| format!("{key} is not an array"))
}

pub fn apply(root: &mut Value, t: &ToggleTarget, enabled: bool) -> Result<(), String> {
    let obj = root
        .as_object_mut()
        .ok_or("config file is not a JSON object")?;
    let container = match (t.file, &t.project_path) {
        (ToggleFile::ClaudeJson, Some(project)) => {
            let projects = object_at(obj, "projects")?;
            let key = projects
                .keys()
                .find(|k| same_project(k, project))
                .cloned()
                .unwrap_or_else(|| normalize_project(project).replace('\\', "/"));
            object_at(projects, &key)?
        }
        _ => obj,
    };
    match t.key {
        ToggleKey::EnabledPlugins => {
            object_at(container, "enabledPlugins")?.insert(t.name.clone(), Value::Bool(enabled));
        }
        ToggleKey::SkillOverrides => {
            let map = object_at(container, "skillOverrides")?;
            if enabled {
                map.shift_remove(&t.name);
            } else {
                map.insert(t.name.clone(), Value::String("off".into()));
            }
        }
        ToggleKey::DisabledMcpServers | ToggleKey::DisabledMcpjsonServers => {
            let key = if t.key == ToggleKey::DisabledMcpServers {
                "disabledMcpServers"
            } else {
                "disabledMcpjsonServers"
            };
            let list = array_at(container, key)?;
            let present = list.iter().any(|v| v.as_str() == Some(t.name.as_str()));
            if enabled {
                list.retain(|v| v.as_str() != Some(t.name.as_str()));
            } else if !present {
                list.push(Value::String(t.name.clone()));
            }
        }
    }
    Ok(())
}

fn stamp(now: SystemTime) -> String {
    humantime::format_rfc3339_seconds(now)
        .to_string()
        .chars()
        .filter(char::is_ascii_digit)
        .enumerate()
        .flat_map(|(i, c)| if i == 8 { vec!['-', c] } else { vec![c] })
        .collect()
}

fn slug(file: &Path) -> String {
    file.to_string_lossy()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

pub fn backup(file: &Path, backups_root: &Path, now: SystemTime) -> Result<PathBuf, String> {
    let dir = backups_root.join(slug(file));
    fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    fs::write(dir.join(SOURCE_FILE), file.to_string_lossy().as_bytes())
        .map_err(|e| format!("write backup source: {e}"))?;
    let base = stamp(now);
    let mut target = dir.join(format!("{base}.json"));
    let mut n = 2;
    while target.exists() {
        target = dir.join(format!("{base}-{n}.json"));
        n += 1;
    }
    fs::copy(file, &target).map_err(|e| format!("backup {}: {e}", file.display()))?;
    let mut copies = list_copies(&dir);
    while copies.len() > KEEP {
        let oldest = copies.remove(0);
        let _ = fs::remove_file(oldest);
    }
    Ok(target)
}

fn list_copies(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    files.sort_by_key(|p| {
        let stem = p
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let (base, n) = match stem.rsplit_once('-') {
            Some((b, n)) if b.len() == 15 => (b.to_string(), n.parse::<u32>().unwrap_or(1)),
            _ => (stem, 1),
        };
        (base, n)
    });
    files
}

pub fn list_backups(backups_root: &Path) -> Vec<ConfigBackup> {
    let mut out = Vec::new();
    for dir in fs::read_dir(backups_root).into_iter().flatten().flatten() {
        let dir = dir.path();
        let source = fs::read_to_string(dir.join(SOURCE_FILE)).unwrap_or_default();
        for copy in list_copies(&dir) {
            let meta = fs::metadata(&copy).ok();
            out.push(ConfigBackup {
                file: source.clone(),
                backup_path: copy.to_string_lossy().into_owned(),
                created_at: copy
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                size_bytes: meta.map_or(0, |m| m.len()),
            });
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    out
}

fn write_atomic(file: &Path, root: &Value) -> Result<(), String> {
    let mut text = serde_json::to_string_pretty(root).map_err(|e| format!("serialize: {e}"))?;
    text.push('\n');
    let parent = file.parent().ok_or("config file has no folder")?;
    fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    let name = file
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let tmp = parent.join(format!(".{name}.echo-studio.tmp"));
    fs::write(&tmp, text).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, file).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("replace {}: {e}", file.display())
    })
}

fn exclude_local_settings(project: &Path) {
    let git_dir = project.join(".git");
    if !git_dir.is_dir() {
        return;
    }
    let mut cmd = std::process::Command::new("git");
    cmd.arg("-C")
        .arg(project)
        .args(["check-ignore", "-q", ".claude/settings.local.json"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let ignored = cmd.status().map(|s| s.code() != Some(1)).unwrap_or(true);
    if ignored {
        return;
    }
    let exclude = git_dir.join("info").join("exclude");
    let mut text = fs::read_to_string(&exclude).unwrap_or_default();
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(".claude/settings.local.json\n");
    let _ = fs::create_dir_all(git_dir.join("info"));
    let _ = fs::write(exclude, text);
}

pub fn set_enabled(
    home: &Path,
    backups_root: &Path,
    known_projects: &[String],
    t: &ToggleTarget,
    enabled: bool,
) -> Result<(), String> {
    let file = target_file(home, t, known_projects)?;
    let existing = read_json(&file)?;
    let created = existing.is_none();
    let mut root = existing.unwrap_or_else(|| Value::Object(Map::new()));
    apply(&mut root, t, enabled)?;
    if !created {
        backup(&file, backups_root, SystemTime::now())?;
    }
    write_atomic(&file, &root)?;
    if created && t.file == ToggleFile::ProjectLocalSettings {
        if let Some(p) = &t.project_path {
            exclude_local_settings(Path::new(&normalize_project(p)));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn target(file: ToggleFile, project: Option<&str>, key: ToggleKey, name: &str) -> ToggleTarget {
        ToggleTarget {
            file,
            project_path: project.map(String::from),
            key,
            name: name.into(),
        }
    }

    #[test]
    fn changes_one_key_and_keeps_order() {
        let home = tempfile::tempdir().unwrap();
        let backups = tempfile::tempdir().unwrap();
        let settings = home.path().join(".claude").join("settings.json");
        fs::create_dir_all(settings.parent().unwrap()).unwrap();
        let original = "{\n  \"zeta\": 1,\n  \"enabledPlugins\": {\n    \"b@m\": true,\n    \"a@m\": true\n  },\n  \"alpha\": {\n    \"x\": [1, 2]\n  }\n}\n";
        fs::write(&settings, original).unwrap();

        let t = target(
            ToggleFile::UserSettings,
            None,
            ToggleKey::EnabledPlugins,
            "b@m",
        );
        set_enabled(home.path(), backups.path(), &[], &t, false).unwrap();

        let after = fs::read_to_string(&settings).unwrap();
        let expected = "{\n  \"zeta\": 1,\n  \"enabledPlugins\": {\n    \"b@m\": false,\n    \"a@m\": true\n  },\n  \"alpha\": {\n    \"x\": [\n      1,\n      2\n    ]\n  }\n}\n";
        assert_eq!(after, expected);
        let copies = list_backups(backups.path());
        assert_eq!(copies.len(), 1);
        assert_eq!(
            fs::read_to_string(&copies[0].backup_path).unwrap(),
            original
        );
        assert_eq!(copies[0].file, settings.to_string_lossy());
    }

    #[test]
    fn skill_override_and_mcp_arrays() {
        let mut root = serde_json::json!({ "skillOverrides": { "x": "off", "y": "name-only" } });
        let skill = target(
            ToggleFile::UserSettings,
            None,
            ToggleKey::SkillOverrides,
            "x",
        );
        apply(&mut root, &skill, true).unwrap();
        assert_eq!(
            root["skillOverrides"],
            serde_json::json!({ "y": "name-only" })
        );
        apply(&mut root, &skill, false).unwrap();
        assert_eq!(root["skillOverrides"]["x"], "off");

        let mut cj =
            serde_json::json!({ "projects": { "c:/Work/App": { "disabledMcpServers": ["a"] } } });
        let mcp = target(
            ToggleFile::ClaudeJson,
            Some("C:\\Work\\App"),
            ToggleKey::DisabledMcpServers,
            "b",
        );
        apply(&mut cj, &mcp, false).unwrap();
        apply(&mut cj, &mcp, false).unwrap();
        assert_eq!(
            cj["projects"]["c:/Work/App"]["disabledMcpServers"],
            serde_json::json!(["a", "b"])
        );
        apply(&mut cj, &mcp, true).unwrap();
        assert_eq!(
            cj["projects"]["c:/Work/App"]["disabledMcpServers"],
            serde_json::json!(["a"])
        );

        let global = target(
            ToggleFile::ClaudeJson,
            None,
            ToggleKey::DisabledMcpServers,
            "g",
        );
        apply(&mut cj, &global, false).unwrap();
        assert_eq!(cj["disabledMcpServers"], serde_json::json!(["g"]));
    }

    #[test]
    fn creates_missing_local_settings_without_backup() {
        let home = tempfile::tempdir().unwrap();
        let proj = tempfile::tempdir().unwrap();
        let backups = tempfile::tempdir().unwrap();
        let p = proj.path().to_string_lossy().into_owned();
        let t = target(
            ToggleFile::ProjectLocalSettings,
            Some(&p),
            ToggleKey::DisabledMcpjsonServers,
            "web",
        );
        set_enabled(
            home.path(),
            backups.path(),
            std::slice::from_ref(&p),
            &t,
            false,
        )
        .unwrap();
        let text = fs::read_to_string(proj.path().join(".claude/settings.local.json")).unwrap();
        assert_eq!(
            text,
            "{\n  \"disabledMcpjsonServers\": [\n    \"web\"\n  ]\n}\n"
        );
        assert!(list_backups(backups.path()).is_empty());
    }

    #[test]
    fn keeps_twenty_copies_and_numbers_collisions() {
        let dir = tempfile::tempdir().unwrap();
        let backups = tempfile::tempdir().unwrap();
        let file = dir.path().join("settings.json");
        fs::write(&file, "{}").unwrap();
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(1_790_000_000);
        let first = backup(&file, backups.path(), t0).unwrap();
        let second = backup(&file, backups.path(), t0).unwrap();
        assert!(second
            .to_string_lossy()
            .ends_with(&format!("{}-2.json", stamp(t0))));
        assert_ne!(first, second);
        for i in 1..=20 {
            backup(&file, backups.path(), t0 + Duration::from_secs(i)).unwrap();
        }
        let copies = list_backups(backups.path());
        assert_eq!(copies.len(), 20);
        assert!(!first.exists() && !second.exists());
        assert_eq!(copies[0].created_at, stamp(t0 + Duration::from_secs(20)));
    }

    #[test]
    fn rejects_bad_targets_and_leaves_file_alone() {
        let home = tempfile::tempdir().unwrap();
        let backups = tempfile::tempdir().unwrap();
        let shared = target(
            ToggleFile::UserSettings,
            Some("C:\\p"),
            ToggleKey::EnabledPlugins,
            "a@m",
        );
        assert!(set_enabled(
            home.path(),
            backups.path(),
            &["C:\\p".into()],
            &shared,
            false
        )
        .is_err());
        let unknown = target(
            ToggleFile::ProjectLocalSettings,
            Some("C:\\nope"),
            ToggleKey::SkillOverrides,
            "x",
        );
        assert!(set_enabled(home.path(), backups.path(), &[], &unknown, false).is_err());
        let wrong_key = target(
            ToggleFile::ClaudeJson,
            None,
            ToggleKey::EnabledPlugins,
            "a@m",
        );
        assert!(set_enabled(home.path(), backups.path(), &[], &wrong_key, false).is_err());

        let settings = home.path().join(".claude/settings.json");
        fs::create_dir_all(settings.parent().unwrap()).unwrap();
        fs::write(&settings, "{ broken").unwrap();
        let ok = target(
            ToggleFile::UserSettings,
            None,
            ToggleKey::EnabledPlugins,
            "a@m",
        );
        assert!(set_enabled(home.path(), backups.path(), &[], &ok, false).is_err());
        assert_eq!(fs::read_to_string(&settings).unwrap(), "{ broken");
        assert!(list_backups(backups.path()).is_empty());
    }

    #[test]
    fn stamp_format() {
        let t = SystemTime::UNIX_EPOCH + Duration::from_secs(1_790_000_000);
        assert!(stamp(t).starts_with("20260921-"));
        assert_eq!(stamp(t).len(), 15);
        assert_eq!(&stamp(t)[8..9], "-");
    }
}
