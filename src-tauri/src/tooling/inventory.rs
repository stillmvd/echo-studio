use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use serde_json::Value;

use super::effective::{scan_global, scan_project};
use super::runs::{iso_ms, key, Runs, Tally};
use super::{Kind, Origin, State, ToggleFile, ToggleKey, ToggleTarget, ToolItem};
use crate::workbench::usage::claude_slug;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Copy {
    pub project: String,
    pub path: String,
    pub file: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOff {
    pub project: String,
    pub target: ToggleTarget,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    #[serde(flatten)]
    pub item: ToolItem,
    pub copies: Vec<Copy>,
    pub project_off: Vec<ProjectOff>,
    pub installed: Option<i64>,
    pub npx: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub count: u32,
    pub last: Option<i64>,
    pub days: Vec<(i64, u32)>,
    pub projects: Vec<(String, u32)>,
}

pub struct Place {
    pub name: String,
    pub path: String,
}

fn created(path: &str) -> Option<i64> {
    let meta = fs::metadata(path).ok()?;
    let t = meta.created().or_else(|_| meta.modified()).ok()?;
    Some(t.duration_since(UNIX_EPOCH).ok()?.as_millis() as i64)
}

fn npx_lock(home: &Path) -> HashMap<String, Option<i64>> {
    fs::read(home.join(".agents").join(".skill-lock.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .and_then(|v| v.get("skills")?.as_object().cloned())
        .map(|m| {
            m.into_iter()
                .map(|(k, v)| {
                    (
                        k,
                        v.get("installedAt")
                            .and_then(Value::as_str)
                            .and_then(iso_ms),
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

fn skills_off(home: &Path) -> Vec<String> {
    fs::read(home.join(".claude").join("settings.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .and_then(|v| v.get("skillOverrides")?.as_object().cloned())
        .map(|m| {
            m.into_iter()
                .filter(|(_, v)| v.as_str() == Some("off"))
                .map(|(k, _)| k)
                .collect()
        })
        .unwrap_or_default()
}

fn born(item: &ToolItem) -> Option<i64> {
    item.file_path
        .as_deref()
        .filter(|f| !f.ends_with(".claude.json"))
        .and_then(created)
}

pub fn list(home: &Path, places: &[Place]) -> Vec<Entry> {
    let lock = npx_lock(home);
    let off = skills_off(home);
    let mut entries: Vec<Entry> = Vec::new();
    let mut global_on: HashMap<String, bool> = HashMap::new();
    let global = scan_global(home).items;
    let plugin_installed: HashMap<String, Option<i64>> = global
        .iter()
        .filter_map(|i| {
            let p = i.plugin.as_ref()?;
            Some((
                i.plugin_key.clone()?,
                p.installed_at.as_deref().and_then(iso_ms),
            ))
        })
        .collect();
    let installed_of = |item: &ToolItem, npx: bool| {
        if npx {
            lock.get(&item.name)
                .copied()
                .flatten()
                .or_else(|| born(item))
        } else if item.origin == Origin::Plugin {
            item.plugin_key
                .as_ref()
                .and_then(|k| plugin_installed.get(k).copied().flatten())
        } else {
            born(item)
        }
    };
    for item in global {
        global_on.insert(item.id.clone(), item.state == State::Enabled);
        let npx = item.kind == Kind::Skill
            && item.origin == Origin::User
            && lock.contains_key(&item.name);
        let installed = installed_of(&item, npx);
        entries.push(Entry {
            item,
            copies: Vec::new(),
            project_off: Vec::new(),
            installed,
            npx,
        });
    }
    let mut index: HashMap<String, usize> = entries
        .iter()
        .enumerate()
        .map(|(i, e)| (e.item.id.clone(), i))
        .collect();

    for place in places {
        for item in scan_project(home, &place.path).items {
            if item.origin == Origin::Plugin && !index.contains_key(&item.id) {
                let installed = installed_of(&item, false);
                index.insert(item.id.clone(), entries.len());
                entries.push(Entry {
                    item,
                    copies: Vec::new(),
                    project_off: Vec::new(),
                    installed,
                    npx: false,
                });
                continue;
            }
            match item.origin {
                Origin::Project | Origin::Local => {
                    let id = format!("{}:project:{}", item.kind.as_str(), item.qualified_name);
                    let copy = Copy {
                        project: place.name.clone(),
                        path: place.path.clone(),
                        file: item.file_path.clone(),
                    };
                    let born = born(&item);
                    match index.get(&id) {
                        Some(&i) => {
                            let e = &mut entries[i];
                            e.copies.push(copy);
                            e.installed = match (e.installed, born) {
                                (Some(a), Some(b)) => Some(a.min(b)),
                                (a, b) => a.or(b),
                            };
                        }
                        None => {
                            let mut item = item;
                            item.id = id.clone();
                            item.override_mode = None;
                            item.state = if item.kind == Kind::Skill && off.contains(&item.name) {
                                State::Disabled
                            } else {
                                State::Enabled
                            };
                            item.toggle = (item.kind == Kind::Skill).then(|| ToggleTarget {
                                file: ToggleFile::UserSettings,
                                project_path: None,
                                key: ToggleKey::SkillOverrides,
                                name: item.name.clone(),
                            });
                            index.insert(id, entries.len());
                            entries.push(Entry {
                                item,
                                copies: vec![copy],
                                project_off: Vec::new(),
                                installed: born,
                                npx: false,
                            });
                        }
                    }
                }
                _ => {
                    let disabled_here = item.state == State::Disabled
                        && global_on.get(&item.id).copied().unwrap_or(false);
                    if let (true, Some(target), Some(&i)) =
                        (disabled_here, item.toggle, index.get(&item.id))
                    {
                        entries[i].project_off.push(ProjectOff {
                            project: place.name.clone(),
                            target,
                        });
                    }
                }
            }
        }
    }
    entries
}

fn mcp_key(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn run_keys(item: &ToolItem, skills: &HashSet<&str>, commands: &HashSet<&str>) -> Vec<String> {
    let q = item.qualified_name.as_str();
    match item.kind {
        Kind::Skill if commands.contains(q) => vec![key('s', q)],
        Kind::Command if skills.contains(q) => vec![key('c', q)],
        Kind::Skill | Kind::Command => vec![key('s', q), key('c', q)],
        Kind::Agent => vec![key('a', q)],
        Kind::Mcp => match (item.origin, q.split_once(':')) {
            (Origin::Plugin, Some((plugin, _))) => {
                vec![key(
                    'm',
                    &mcp_key(&format!("plugin_{plugin}_{}", item.name)),
                )]
            }
            _ => vec![key('m', &mcp_key(&item.name))],
        },
        Kind::Plugin => Vec::new(),
    }
}

fn project_name<'a>(slug: &'a str, slugs: &'a [(String, String)]) -> &'a str {
    slugs
        .iter()
        .filter(|(s, _)| {
            slug.strip_prefix(s.as_str())
                .is_some_and(|rest| rest.is_empty() || rest.starts_with("--"))
        })
        .max_by_key(|(s, _)| s.len())
        .map_or(slug, |(_, n)| n.as_str())
}

pub fn usage(entries: &[Entry], runs: &Runs, places: &[Place]) -> HashMap<String, Usage> {
    let slugs: Vec<(String, String)> = places
        .iter()
        .map(|p| (claude_slug(&p.path), p.name.clone()))
        .collect();
    let names = |k: Kind| -> HashSet<&str> {
        entries
            .iter()
            .filter(|e| e.item.kind == k)
            .map(|e| e.item.qualified_name.as_str())
            .collect()
    };
    let (skills, commands) = (names(Kind::Skill), names(Kind::Command));
    let mut per: HashMap<String, (Tally, BTreeMap<String, u32>)> = HashMap::new();
    for e in entries {
        let acc = per.entry(e.item.id.clone()).or_default();
        for k in run_keys(&e.item, &skills, &commands) {
            if let Some(agg) = runs.by_key.get(&k) {
                acc.0.n += agg.tally.n;
                acc.0.last = acc.0.last.max(agg.tally.last);
                for (d, n) in &agg.tally.days {
                    *acc.0.days.entry(*d).or_insert(0) += n;
                }
                for (slug, n) in &agg.slugs {
                    *acc.1
                        .entry(project_name(slug, &slugs).to_string())
                        .or_insert(0) += n;
                }
            }
        }
    }
    for e in entries.iter().filter(|e| e.item.kind == Kind::Plugin) {
        let mut sum = (Tally::default(), BTreeMap::new());
        for c in entries.iter().filter(|c| {
            c.item.kind != Kind::Plugin
                && c.item.origin == Origin::Plugin
                && c.item.plugin_key == e.item.plugin_key
        }) {
            let (t, p) = &per[&c.item.id];
            sum.0.n += t.n;
            sum.0.last = sum.0.last.max(t.last);
            for (d, n) in &t.days {
                *sum.0.days.entry(*d).or_insert(0) += n;
            }
            for (name, n) in p {
                *sum.1.entry(name.clone()).or_insert(0) += n;
            }
        }
        per.insert(e.item.id.clone(), sum);
    }
    per.into_iter()
        .map(|(id, (t, p))| {
            let mut projects: Vec<(String, u32)> = p.into_iter().collect();
            projects.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            let u = Usage {
                count: t.n,
                last: (t.n > 0).then_some(t.last),
                days: t.days.into_iter().collect(),
                projects,
            };
            (id, u)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tooling::runs::Agg;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn merges_project_copies_and_records_project_disables() {
        let home = tempfile::tempdir().unwrap();
        let h = home.path();
        write(
            &h.join(".claude/skills/jira/SKILL.md"),
            "---\nname: jira\ndescription: Jira\n---\n",
        );
        let mut places = Vec::new();
        for name in ["A", "B"] {
            let p = h.join("Projects").join(name);
            write(
                &p.join(".claude/skills/speckit-plan/SKILL.md"),
                "---\nname: speckit-plan\n---\n",
            );
            write(
                &p.join(".mcp.json"),
                r#"{"mcpServers":{"chrome-devtools":{"command":"npx"}}}"#,
            );
            places.push(Place {
                name: name.into(),
                path: p.to_string_lossy().into_owned(),
            });
        }
        write(
            &h.join("Projects/B/.claude/settings.local.json"),
            r#"{"skillOverrides":{"jira":"off"}}"#,
        );
        let entries = list(h, &places);
        let find = |id: &str| entries.iter().find(|e| e.item.id == id).unwrap();
        let sp = find("skill:project:speckit-plan");
        assert_eq!(
            sp.copies
                .iter()
                .map(|c| c.project.as_str())
                .collect::<Vec<_>>(),
            ["A", "B"]
        );
        assert_eq!(
            sp.item.toggle.as_ref().unwrap().file,
            ToggleFile::UserSettings
        );
        assert_eq!(find("mcp:project:chrome-devtools").copies.len(), 2);
        let jira = find("skill:user:jira");
        assert!(jira.copies.is_empty());
        assert_eq!(jira.project_off.len(), 1);
        assert_eq!(jira.project_off[0].project, "B");
        assert_eq!(
            entries
                .iter()
                .filter(|e| e.item.name == "speckit-plan")
                .count(),
            1
        );
    }

    #[test]
    fn usage_matches_runs_and_sums_plugins() {
        let mut item = ToolItem::new(Kind::Skill, Origin::User, "jira".into(), "jira".into());
        item.id = "skill:user:jira".into();
        let mut pskill = ToolItem::new(
            Kind::Skill,
            Origin::Plugin,
            "review".into(),
            "pony:review".into(),
        );
        pskill.plugin_key = Some("pony@m".into());
        let mut pmcp = ToolItem::new(
            Kind::Mcp,
            Origin::Plugin,
            "search".into(),
            "mem:search".into(),
        );
        pmcp.plugin_key = Some("mem@m".into());
        let mut plugin =
            ToolItem::new(Kind::Plugin, Origin::Plugin, "pony".into(), "pony@m".into());
        plugin.plugin_key = Some("pony@m".into());
        let entry = |item: ToolItem| Entry {
            item,
            copies: vec![],
            project_off: vec![],
            installed: None,
            npx: false,
        };
        let entries = vec![entry(item), entry(pskill), entry(pmcp), entry(plugin)];
        let mut runs = Runs::default();
        let mut add = |k: &str, slug: &str, n: u32, last: i64| {
            let a = runs
                .by_key
                .entry(k.to_string())
                .or_insert_with(Agg::default);
            a.tally.n += n;
            a.tally.last = a.tally.last.max(last);
            a.tally.days.insert(last / super::super::runs::DAY_MS, n);
            *a.slugs.entry(slug.into()).or_insert(0) += n;
        };
        add("s|jira", "C--P-Echo", 3, 1000);
        add("c|jira", "C--P-Echo--claude-worktrees-x", 1, 2000);
        add("s|pony:review", "C--other", 5, 500);
        add("m|plugin_mem_search", "C--P-Echo", 2, 10);
        let places = [Place {
            name: "Echo".into(),
            path: "C:\\P\\Echo".into(),
        }];
        let u = usage(&entries, &runs, &places);
        assert_eq!(u["skill:user:jira"].count, 4);
        assert_eq!(u["skill:user:jira"].last, Some(2000));
        assert_eq!(u["skill:user:jira"].projects, vec![("Echo".to_string(), 4)]);
        assert_eq!(u["skill:plugin:pony:review"].count, 5);
        assert_eq!(u["mcp:plugin:mem:search"].count, 2);
        assert_eq!(u["plugin:plugin:pony@m"].count, 5);
        assert_eq!(
            u["plugin:plugin:pony@m"].projects,
            vec![("C--other".to_string(), 5)]
        );
    }
}
