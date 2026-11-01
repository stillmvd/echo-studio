use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::inventory::{Copy, Entry, Place};
use super::runs::iso_ms;
use super::scan::scan_dir;
use super::{mcp, Kind, Origin, PluginContents, PluginInfo, State, ToolItem};
use crate::agent::{AgentKind, Profile};

pub const READ_ONLY: &str = "Инструменты Kimi пока только для просмотра";

pub fn toml_array(text: &str, key: &str) -> Vec<String> {
    let mut lines = text.lines();
    let value = loop {
        let Some(line) = lines.next() else {
            return Vec::new();
        };
        let line = line.trim_start();
        if line.starts_with('[') {
            return Vec::new();
        }
        if let Some(value) = line
            .strip_prefix(key)
            .map(str::trim_start)
            .and_then(|rest| rest.strip_prefix('='))
        {
            break value;
        }
    };
    let mut items: Vec<String> = Vec::new();
    let mut opened = false;
    for chunk in std::iter::once(value).chain(lines) {
        let mut current: Option<String> = None;
        let mut quote = '"';
        let mut chars = chunk.chars();
        while let Some(c) = chars.next() {
            if let Some(s) = current.as_mut() {
                if c == quote {
                    items.extend(current.take().filter(|s| !s.is_empty()));
                } else if c == '\\' && quote == '"' {
                    s.extend(chars.next());
                } else {
                    s.push(c);
                }
                continue;
            }
            match c {
                '[' if !opened => opened = true,
                _ if !opened && !c.is_whitespace() => return Vec::new(),
                '"' | '\'' => {
                    quote = c;
                    current = Some(String::new());
                }
                '#' => break,
                ']' => return items,
                _ => {}
            }
        }
    }
    Vec::new()
}

fn expand(dir: &str, home: &Path, project: Option<&Path>) -> Option<PathBuf> {
    if let Some(rest) = dir.strip_prefix("~/").or_else(|| dir.strip_prefix("~\\")) {
        return project.is_none().then(|| home.join(rest));
    }
    let path = PathBuf::from(dir);
    if path.is_absolute() {
        return project.is_none().then_some(path);
    }
    project.map(|p| p.join(path))
}

struct Roots {
    skills: Vec<PathBuf>,
    agents: Vec<PathBuf>,
}

fn roots(profile: &Profile, home: &Path, project: Option<&Path>) -> Roots {
    let config = fs::read_to_string(&profile.settings).unwrap_or_default();
    let extra = |key: &str| -> Vec<PathBuf> {
        toml_array(&config, key)
            .iter()
            .filter_map(|d| expand(d, home, project))
            .collect()
    };
    let base = match project {
        Some(p) => p.join(profile.project_dir),
        None => profile.home.clone(),
    };
    let agents_home = project.unwrap_or(home).join(".agents");
    let mut skills = vec![base.join("skills"), agents_home.join("skills")];
    skills.extend(extra("extra_skill_dirs"));
    let mut agents = vec![base.join("agents")];
    agents.extend(extra("extra_agent_dirs"));
    Roots { skills, agents }
}

fn read_only(mut item: ToolItem) -> ToolItem {
    item.toggle = None;
    item.toggle_hint = Some(READ_ONLY.to_owned());
    item
}

fn scan_dirs(dirs: &[PathBuf], kind: Kind, origin: Origin) -> Vec<ToolItem> {
    let mut out: Vec<ToolItem> = Vec::new();
    for dir in dirs.iter().filter(|d| d.is_dir()) {
        for item in scan_dir(dir, kind, origin) {
            if !out.iter().any(|o| o.id == item.id) {
                out.push(read_only(item));
            }
        }
    }
    out
}

fn mcp_items(file: &Path, origin: Origin, label: &str) -> Vec<ToolItem> {
    let Some(v) = fs::read_to_string(file)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
    else {
        return Vec::new();
    };
    mcp::servers(v.get("mcpServers"), origin, file, label, None)
        .into_iter()
        .map(read_only)
        .collect()
}

fn plugin_items(profile: &Profile) -> Vec<ToolItem> {
    let Some(v) = fs::read_to_string(&profile.plugins)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
    else {
        return Vec::new();
    };
    v.get("plugins")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|p| {
                    let id = p.get("id")?.as_str()?.to_owned();
                    let root = p.get("root").and_then(Value::as_str).unwrap_or_default();
                    let version = fs::read_to_string(Path::new(root).join("kimi.plugin.json"))
                        .ok()
                        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
                        .and_then(|m| m.get("version")?.as_str().map(String::from));
                    let mut item =
                        ToolItem::new(Kind::Plugin, Origin::Plugin, id.clone(), id.clone());
                    item.plugin_key = Some(id);
                    item.description = p
                        .get("originalSource")
                        .and_then(Value::as_str)
                        .map(String::from);
                    item.state = if p.get("enabled").and_then(Value::as_bool) == Some(false) {
                        State::Disabled
                    } else {
                        State::Enabled
                    };
                    item.plugin = Some(PluginInfo {
                        version,
                        marketplace: p
                            .get("source")
                            .and_then(Value::as_str)
                            .unwrap_or("kimi")
                            .to_owned(),
                        installed_at: p
                            .get("installedAt")
                            .and_then(Value::as_str)
                            .map(String::from),
                        last_updated: p.get("updatedAt").and_then(Value::as_str).map(String::from),
                        install_path: root.to_owned(),
                        contents: PluginContents::default(),
                    });
                    Some(read_only(item))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn entry(item: ToolItem, copies: Vec<Copy>) -> Entry {
    let installed = item
        .plugin
        .as_ref()
        .and_then(|p| p.installed_at.as_deref())
        .and_then(iso_ms);
    Entry {
        item,
        copies,
        project_off: Vec::new(),
        installed,
        npx: false,
    }
}

pub fn list(home: &Path, places: &[Place]) -> Vec<Entry> {
    let profile = Profile::of(AgentKind::Kimi, home);
    let global = roots(&profile, home, None);
    let mut entries: Vec<Entry> = Vec::new();
    let mut items = scan_dirs(&global.skills, Kind::Skill, Origin::User);
    items.extend(scan_dirs(&global.agents, Kind::Agent, Origin::User));
    items.extend(mcp_items(
        &profile.mcp,
        Origin::User,
        "~/.kimi-code/mcp.json",
    ));
    items.extend(plugin_items(&profile));
    entries.extend(items.into_iter().map(|i| entry(i, Vec::new())));

    let mut index: HashMap<String, usize> = entries
        .iter()
        .enumerate()
        .map(|(i, e)| (e.item.id.clone(), i))
        .collect();
    for place in places {
        let root = Path::new(&place.path);
        let local = roots(&profile, home, Some(root));
        let mut found = scan_dirs(&local.skills, Kind::Skill, Origin::Project);
        found.extend(scan_dirs(&local.agents, Kind::Agent, Origin::Project));
        found.extend(mcp_items(
            &root.join(profile.project_dir).join("mcp.json"),
            Origin::Project,
            ".kimi-code/mcp.json",
        ));
        for mut item in found {
            let copy = Copy {
                project: place.name.clone(),
                path: place.path.clone(),
                file: item.file_path.clone(),
            };
            let id = format!("{}:project:{}", item.kind.as_str(), item.qualified_name);
            match index.get(&id) {
                Some(&i) => entries[i].copies.push(copy),
                None => {
                    item.id = id.clone();
                    index.insert(id, entries.len());
                    entries.push(entry(item, vec![copy]));
                }
            }
        }
    }
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn toml_arrays_are_read_from_single_and_multi_line() {
        let text = "a = 1\nextra_skill_dirs = [\"~/.claude/skills\",\".claude/skills\"]\nextra_agent_dirs = [\n  \"~/x\",\n  'y'\n]\n";
        assert_eq!(
            toml_array(text, "extra_skill_dirs"),
            ["~/.claude/skills", ".claude/skills"]
        );
        assert_eq!(toml_array(text, "extra_agent_dirs"), ["~/x", "y"]);
        assert!(toml_array(text, "missing").is_empty());
        assert!(toml_array("extra_skill_dirs_x = [\"z\"]", "extra_skill_dirs").is_empty());
    }

    #[test]
    fn toml_arrays_skip_comments_and_tables() {
        let text = "extra_skill_dirs = [\n  \"~/a\", # основной ]\n  \"~/b#c\",\n  \"C:\\\\x\",\n]\n[mcp]\nextra_agent_dirs = [\"z\"]\n";
        assert_eq!(
            toml_array(text, "extra_skill_dirs"),
            ["~/a", "~/b#c", "C:\\x"]
        );
        assert!(toml_array(text, "extra_agent_dirs").is_empty());
    }

    #[test]
    fn kimi_inventory_reads_global_and_project_sources() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let kimi = home.join(".kimi-code");
        write(
            &kimi.join("config.toml"),
            "extra_skill_dirs = [\"~/.claude/skills\",\".claude/skills\",\"~/shared-skills\"]\nextra_agent_dirs = [\"~/team/prompts\"]\n",
        );
        write(
            &home.join("shared-skills/deploy/SKILL.md"),
            "---\nname: deploy\n---\nD",
        );
        write(
            &home.join("team/prompts/review.md"),
            "---\nname: review\n---\nR",
        );
        write(
            &kimi.join("skills/commit/SKILL.md"),
            "---\nname: commit\n---\nКоммит",
        );
        write(
            &home.join(".claude/skills/jira/SKILL.md"),
            "---\nname: jira\n---\nJira",
        );
        write(
            &home.join(".agents/skills/media/SKILL.md"),
            "---\nname: media\n---\nM",
        );
        write(&kimi.join("agents/coder.md"), "---\nname: coder\n---\nC");
        write(
            &kimi.join("mcp.json"),
            r#"{"mcpServers":{"rea":{"command":"rea"}}}"#,
        );
        write(
            &kimi.join("plugins/installed.json"),
            r#"{"version":1,"plugins":[{"id":"echo-memory","root":"C:/x","enabled":true,"installedAt":"2026-11-01T11:44:47.975Z"}]}"#,
        );
        let proj = home.join("P");
        write(
            &proj.join(".claude/skills/speckit/SKILL.md"),
            "---\nname: speckit\n---\nS",
        );
        write(
            &proj.join(".kimi-code/mcp.json"),
            r#"{"mcpServers":{"agentation":{"command":"npx"}}}"#,
        );
        let places = [Place {
            name: "P".into(),
            path: proj.to_string_lossy().into_owned(),
        }];
        let entries = list(home, &places);
        let ids: Vec<&str> = entries.iter().map(|e| e.item.id.as_str()).collect();
        for id in [
            "skill:user:commit",
            "skill:user:jira",
            "skill:user:media",
            "skill:user:deploy",
            "agent:user:coder",
            "agent:user:review",
            "mcp:user:rea",
            "plugin:plugin:echo-memory",
            "skill:project:speckit",
            "mcp:project:agentation",
        ] {
            assert!(ids.contains(&id), "{id} not in {ids:?}");
        }
        assert!(entries.iter().all(|e| e.item.toggle.is_none()));
        let speckit = entries
            .iter()
            .find(|e| e.item.id == "skill:project:speckit")
            .unwrap();
        assert_eq!(speckit.copies.len(), 1);
    }
}
