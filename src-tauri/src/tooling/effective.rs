use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::paths::{claude_dir, claude_json, installed_plugins, normalize_project, same_project};
use super::plugins::{read_installed, scan_plugin, Installed};
use super::scan::scan_root;
use super::settings::{project_entry, read_json, Toggles};
use super::{
    mcp, Conflict, Kind, Origin, ScanResult, ScopeKind, ScopeRef, SourceState, SourceStatus, State,
    ToggleFile, ToggleKey, ToggleTarget, ToolItem,
};
use crate::conversations::paths::display_name;

pub const HINT_PLUGIN_CHILD: &str = "Turns on and off with its plugin";
pub const HINT_COMMAND: &str = "Claude Code has no switch for commands";
pub const HINT_AGENT: &str = "Claude Code has no switch for agents";

fn load(path: &Path, sources: &mut Vec<SourceStatus>) -> Option<Value> {
    match read_json(path) {
        Ok(Some(v)) => {
            sources.push(SourceStatus::new(path, SourceState::Ok, None));
            Some(v)
        }
        Ok(None) => {
            sources.push(SourceStatus::new(path, SourceState::Missing, None));
            None
        }
        Err(e) => {
            sources.push(SourceStatus::new(path, SourceState::Error, Some(e)));
            None
        }
    }
}

pub fn global_scope() -> ScopeRef {
    ScopeRef {
        kind: ScopeKind::Global,
        path: None,
        name: "Global".into(),
        available: true,
    }
}

pub fn project_scope(path: &str) -> ScopeRef {
    let path = normalize_project(path);
    ScopeRef {
        kind: ScopeKind::Project,
        name: display_name(&path),
        available: Path::new(&path).is_dir(),
        path: Some(path),
    }
}

pub fn list_scopes(home: &Path, conversation_cwds: &[String]) -> Vec<ScopeRef> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut scopes = vec![global_scope()];
    for cwd in conversation_cwds {
        if seen.insert(normalize_project(cwd).to_lowercase()) {
            scopes.push(project_scope(cwd));
        }
    }
    let mut rest: Vec<ScopeRef> = read_json(&claude_json(home))
        .ok()
        .flatten()
        .and_then(|cj| {
            cj.get("projects")
                .and_then(Value::as_object)
                .map(|m| m.keys().cloned().collect::<Vec<_>>())
        })
        .unwrap_or_default()
        .into_iter()
        .filter(|k| seen.insert(normalize_project(k).to_lowercase()))
        .map(|k| project_scope(&k))
        .collect();
    rest.sort_by_key(|s| s.name.to_lowercase());
    scopes.extend(rest);
    scopes
}

fn counts(items: &[ToolItem]) -> BTreeMap<String, usize> {
    let mut map = BTreeMap::new();
    for item in items {
        *map.entry(item.kind.as_str().to_string()).or_insert(0) += 1;
    }
    map
}

fn plugins_for(installed: Vec<Installed>, project: Option<&str>) -> Vec<Installed> {
    let mut by_key: HashMap<String, Installed> = HashMap::new();
    for p in installed {
        let project_scoped = matches!(p.scope.as_str(), "project" | "local");
        let applies = if project_scoped {
            match (project, p.project_path.as_deref()) {
                (Some(proj), Some(pp)) => same_project(proj, pp),
                _ => false,
            }
        } else {
            true
        };
        if !applies {
            continue;
        }
        match by_key.get(&p.key) {
            Some(existing) if matches!(existing.scope.as_str(), "project" | "local") => {}
            _ => {
                by_key.insert(p.key.clone(), p);
            }
        }
    }
    let mut list: Vec<Installed> = by_key.into_values().collect();
    list.sort_by(|a, b| a.key.cmp(&b.key));
    list
}

fn toggle(file: ToggleFile, project: Option<&str>, key: ToggleKey, name: &str) -> ToggleTarget {
    ToggleTarget {
        file,
        project_path: project.map(normalize_project),
        key,
        name: name.to_string(),
    }
}

fn settings_file(project: Option<&str>) -> ToggleFile {
    if project.is_some() {
        ToggleFile::ProjectLocalSettings
    } else {
        ToggleFile::UserSettings
    }
}

fn apply_states(items: &mut [ToolItem], t: &Toggles, project: Option<&str>) {
    let mut plugin_on: HashMap<String, bool> = HashMap::new();
    for item in items.iter_mut().filter(|i| i.kind == Kind::Plugin) {
        let key = item.qualified_name.clone();
        if item.state == State::Enabled && !t.plugin_enabled(&key) {
            item.state = State::Disabled;
        }
        if item.state != State::Unavailable {
            item.toggle = Some(toggle(
                settings_file(project),
                project,
                ToggleKey::EnabledPlugins,
                &key,
            ));
        }
        plugin_on.insert(key, item.state == State::Enabled);
    }

    for item in items.iter_mut().filter(|i| i.kind != Kind::Plugin) {
        if item.origin == Origin::Plugin {
            let on = item
                .plugin_key
                .as_ref()
                .and_then(|k| plugin_on.get(k))
                .copied()
                .unwrap_or(false);
            if !on && item.state == State::Enabled {
                item.state = State::Unavailable;
            }
            item.toggle_hint = Some(HINT_PLUGIN_CHILD.into());
            continue;
        }
        match item.kind {
            Kind::Command => item.toggle_hint = Some(HINT_COMMAND.into()),
            Kind::Agent => item.toggle_hint = Some(HINT_AGENT.into()),
            Kind::Skill => {
                match t.skill_overrides.get(&item.name).map(String::as_str) {
                    Some("off") => {
                        if item.state == State::Enabled {
                            item.state = State::Disabled;
                        }
                    }
                    Some("on") | None => {}
                    Some(mode) => item.override_mode = Some(mode.to_string()),
                }
                let file = if item.origin == Origin::Project {
                    ToggleFile::ProjectLocalSettings
                } else {
                    settings_file(project)
                };
                item.toggle = Some(toggle(file, project, ToggleKey::SkillOverrides, &item.name));
            }
            Kind::Mcp => {
                let (disabled, file, key) = match item.origin {
                    Origin::Project => (
                        t.disabled_mcpjson.contains(&item.name),
                        ToggleFile::ProjectLocalSettings,
                        ToggleKey::DisabledMcpjsonServers,
                    ),
                    _ => (
                        t.disabled_mcp.contains(&item.name),
                        ToggleFile::ClaudeJson,
                        ToggleKey::DisabledMcpServers,
                    ),
                };
                if disabled && item.state == State::Enabled {
                    item.state = State::Disabled;
                }
                item.toggle = Some(toggle(file, project, key, &item.name));
            }
            Kind::Plugin => {}
        }
    }
}

fn mark_conflicts(items: &mut [ToolItem]) {
    let rank = |o: Origin| match o {
        Origin::Local => 3,
        Origin::Project => 2,
        Origin::User => 1,
        Origin::Plugin => 0,
    };
    let mut groups: HashMap<(Kind, String), Vec<usize>> = HashMap::new();
    for (i, item) in items.iter().enumerate() {
        if item.origin != Origin::Plugin && item.kind != Kind::Plugin {
            groups
                .entry((item.kind, item.name.to_lowercase()))
                .or_default()
                .push(i);
        }
    }
    for ((kind, _), idx) in groups {
        let origins: HashSet<Origin> = idx.iter().map(|&i| items[i].origin).collect();
        if origins.len() < 2 {
            continue;
        }
        match kind {
            Kind::Skill | Kind::Command => {
                for &i in &idx {
                    items[i].conflict = Conflict::SameName;
                }
            }
            _ => {
                let top = idx
                    .iter()
                    .map(|&i| rank(items[i].origin))
                    .max()
                    .unwrap_or(0);
                for &i in &idx {
                    items[i].conflict = if rank(items[i].origin) == top {
                        Conflict::Overrides
                    } else {
                        Conflict::Overridden
                    };
                }
            }
        }
    }
}

fn add_plugins(
    home: &Path,
    project: Option<&str>,
    items: &mut Vec<ToolItem>,
    sources: &mut Vec<SourceStatus>,
) {
    let (installed, status) = read_installed(&installed_plugins(home));
    sources.push(status);
    for p in plugins_for(installed, project) {
        let scan = scan_plugin(&p);
        items.push(scan.plugin);
        items.extend(scan.children);
        sources.extend(scan.sources);
    }
}

pub fn scan_global(home: &Path) -> ScanResult {
    let claude = claude_dir(home);
    let cj_path = claude_json(home);
    let mut sources = Vec::new();
    let user_settings = load(&claude.join("settings.json"), &mut sources);
    let cj = load(&cj_path, &mut sources);
    let mut toggles = Toggles::merge_settings(&[user_settings.as_ref()]);
    toggles.add_claude_json(cj.as_ref(), None);

    let found = scan_root(&claude, Origin::User, None);
    let mut items = found.items;
    sources.extend(found.sources);
    items.extend(mcp::servers(
        cj.as_ref().and_then(|v| v.get("mcpServers")),
        Origin::User,
        &cj_path,
        "~/.claude.json › mcpServers",
        None,
    ));
    add_plugins(home, None, &mut items, &mut sources);
    apply_states(&mut items, &toggles, None);

    ScanResult {
        scope: global_scope(),
        counts: counts(&items),
        items,
        sources,
    }
}

pub fn scan_project(home: &Path, path: &str) -> ScanResult {
    let scope = project_scope(path);
    let project = scope.path.clone().unwrap_or_default();
    let root = PathBuf::from(&project);
    let mut sources = Vec::new();
    if !scope.available {
        sources.push(SourceStatus::new(&root, SourceState::Missing, None));
        return ScanResult {
            scope,
            items: Vec::new(),
            sources,
            counts: BTreeMap::new(),
        };
    }

    let claude = claude_dir(home);
    let cj_path = claude_json(home);
    let project_claude = root.join(".claude");
    let same_as_user = same_project(&project_claude.to_string_lossy(), &claude.to_string_lossy());

    let user_settings = load(&claude.join("settings.json"), &mut sources);
    let (shared, local) = if same_as_user {
        (None, None)
    } else {
        (
            load(&project_claude.join("settings.json"), &mut sources),
            load(&project_claude.join("settings.local.json"), &mut sources),
        )
    };
    let cj = load(&cj_path, &mut sources);
    let mut toggles =
        Toggles::merge_settings(&[user_settings.as_ref(), shared.as_ref(), local.as_ref()]);
    toggles.add_claude_json(cj.as_ref(), Some(&project));

    let mut items = Vec::new();
    let user = scan_root(&claude, Origin::User, None);
    items.extend(user.items);
    sources.extend(user.sources);
    if !same_as_user {
        let proj = scan_root(&project_claude, Origin::Project, None);
        items.extend(proj.items);
        sources.extend(proj.sources);
    }

    items.extend(mcp::servers(
        cj.as_ref().and_then(|v| v.get("mcpServers")),
        Origin::User,
        &cj_path,
        "~/.claude.json › mcpServers",
        None,
    ));
    if let Some((key, entry)) = cj.as_ref().and_then(|v| project_entry(v, &project)) {
        items.extend(mcp::servers(
            entry.get("mcpServers"),
            Origin::Local,
            &cj_path,
            &format!("~/.claude.json › projects › {key} › mcpServers"),
            None,
        ));
    }
    let mcp_json = root.join(".mcp.json");
    if let Some(v) = load(&mcp_json, &mut sources) {
        items.extend(mcp::servers(
            v.get("mcpServers"),
            Origin::Project,
            &mcp_json,
            ".mcp.json › mcpServers",
            None,
        ));
    }

    add_plugins(home, Some(&project), &mut items, &mut sources);
    apply_states(&mut items, &toggles, Some(&project));
    mark_conflicts(&mut items);

    ScanResult {
        scope,
        counts: counts(&items),
        items,
        sources,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    struct Fixture {
        _home: tempfile::TempDir,
        _proj: tempfile::TempDir,
        home: PathBuf,
        project: String,
    }

    fn fixture() -> Fixture {
        let home_dir = tempfile::tempdir().unwrap();
        let proj_dir = tempfile::tempdir().unwrap();
        let home = home_dir.path().to_path_buf();
        let proj = proj_dir.path().to_path_buf();
        let claude = home.join(".claude");

        write(
            &claude.join("skills/shared/SKILL.md"),
            "---\nname: shared\n---\n",
        );
        write(
            &claude.join("skills/quiet/SKILL.md"),
            "---\nname: quiet\n---\n",
        );
        write(
            &claude.join("skills/brief/SKILL.md"),
            "---\nname: brief\n---\n",
        );
        write(
            &claude.join("agents/reviewer.md"),
            "---\nname: reviewer\n---\n",
        );
        write(&claude.join("commands/commit.md"), "Commit");
        write(
            &claude.join("settings.json"),
            r#"{"skillOverrides":{"quiet":"off","brief":"name-only"},"enabledPlugins":{"pony@mkt":false}}"#,
        );

        let install = claude.join("plugins/cache/pony");
        write(
            &install.join("skills/lazy/SKILL.md"),
            "---\nname: lazy\n---\n",
        );
        let registry = serde_json::json!({
            "plugins": { "pony@mkt": [{ "scope": "user", "installPath": install }] }
        });
        write(
            &claude.join("plugins/installed_plugins.json"),
            &registry.to_string(),
        );

        let pkey = proj.to_string_lossy().replace('\\', "/");
        let cj = serde_json::json!({
            "mcpServers": { "fs": { "command": "npx" }, "dup": { "command": "a" } },
            "projects": { pkey: { "mcpServers": { "dup": { "command": "b" } }, "disabledMcpServers": ["fs"] } }
        });
        write(&home.join(".claude.json"), &cj.to_string());

        write(
            &proj.join(".claude/skills/shared/SKILL.md"),
            "---\nname: shared\n---\n",
        );
        write(
            &proj.join(".claude/agents/reviewer.md"),
            "---\nname: reviewer\n---\n",
        );
        write(
            &proj.join(".claude/settings.local.json"),
            r#"{"enabledPlugins":{"pony@mkt":true},"disabledMcpjsonServers":["web"]}"#,
        );
        write(
            &proj.join(".mcp.json"),
            r#"{"mcpServers":{"web":{"url":"https://x"}}}"#,
        );

        Fixture {
            project: proj.to_string_lossy().into_owned(),
            home,
            _home: home_dir,
            _proj: proj_dir,
        }
    }

    fn find<'a>(r: &'a ScanResult, id: &str) -> &'a ToolItem {
        r.items
            .iter()
            .find(|i| i.id == id)
            .unwrap_or_else(|| panic!("no {id}"))
    }

    #[test]
    fn global_states_and_toggles() {
        let f = fixture();
        let r = scan_global(&f.home);
        assert_eq!(r.counts["skill"], 4);
        assert_eq!(r.counts["mcp"], 2);
        assert_eq!(r.counts["plugin"], 1);

        let quiet = find(&r, "skill:user:quiet");
        assert_eq!(quiet.state, State::Disabled);
        let t = quiet.toggle.as_ref().unwrap();
        assert_eq!(
            (t.file, t.key, t.project_path.as_deref()),
            (ToggleFile::UserSettings, ToggleKey::SkillOverrides, None)
        );
        assert_eq!(
            find(&r, "skill:user:brief").override_mode.as_deref(),
            Some("name-only")
        );

        assert_eq!(find(&r, "plugin:plugin:pony@mkt").state, State::Disabled);
        let lazy = find(&r, "skill:plugin:pony:lazy");
        assert_eq!(lazy.state, State::Unavailable);
        assert!(lazy.toggle.is_none());
        assert_eq!(lazy.toggle_hint.as_deref(), Some(HINT_PLUGIN_CHILD));

        let commit = find(&r, "command:user:commit");
        assert!(commit.toggle.is_none());
        assert_eq!(commit.toggle_hint.as_deref(), Some(HINT_COMMAND));

        let fs_mcp = find(&r, "mcp:user:fs");
        assert_eq!(fs_mcp.state, State::Enabled);
        assert_eq!(fs_mcp.toggle.as_ref().unwrap().file, ToggleFile::ClaudeJson);
        assert!(r.items.iter().all(|i| i.conflict == Conflict::None));
    }

    #[test]
    fn project_effective_set() {
        let f = fixture();
        let r = scan_project(&f.home, &f.project);
        assert!(r.scope.available);

        assert_eq!(find(&r, "plugin:plugin:pony@mkt").state, State::Enabled);
        assert_eq!(find(&r, "skill:plugin:pony:lazy").state, State::Enabled);

        assert_eq!(find(&r, "skill:user:shared").conflict, Conflict::SameName);
        assert_eq!(
            find(&r, "skill:project:shared").conflict,
            Conflict::SameName
        );
        assert_eq!(
            find(&r, "agent:project:reviewer").conflict,
            Conflict::Overrides
        );
        assert_eq!(
            find(&r, "agent:user:reviewer").conflict,
            Conflict::Overridden
        );
        assert_eq!(find(&r, "mcp:local:dup").conflict, Conflict::Overrides);
        assert_eq!(find(&r, "mcp:user:dup").conflict, Conflict::Overridden);

        assert_eq!(find(&r, "mcp:user:fs").state, State::Disabled);
        let web = find(&r, "mcp:project:web");
        assert_eq!(web.state, State::Disabled);
        let t = web.toggle.as_ref().unwrap();
        assert_eq!(
            (t.file, t.key),
            (
                ToggleFile::ProjectLocalSettings,
                ToggleKey::DisabledMcpjsonServers
            )
        );
        assert_eq!(
            t.project_path.as_deref(),
            Some(normalize_project(&f.project).as_str())
        );

        let user_skill = find(&r, "skill:user:quiet").toggle.as_ref().unwrap();
        assert_eq!(user_skill.file, ToggleFile::ProjectLocalSettings);
        assert!(find(&r, "command:user:commit").toggle.is_none());
    }

    #[test]
    fn missing_project_is_unavailable() {
        let f = fixture();
        let r = scan_project(&f.home, "C:\\definitely\\not\\here");
        assert!(!r.scope.available);
        assert!(r.items.is_empty());
    }

    #[test]
    fn home_as_project_does_not_duplicate_user_items() {
        let f = fixture();
        let r = scan_project(&f.home, &f.home.to_string_lossy());
        assert!(r.items.iter().all(|i| i.origin != Origin::Project));
        assert_eq!(find(&r, "skill:user:shared").conflict, Conflict::None);
    }

    #[test]
    fn scopes_merge_conversations_and_claude_json() {
        let f = fixture();
        let lower = f.project.to_lowercase();
        let scopes = list_scopes(&f.home, &[lower, "C:\\gone\\app".into()]);
        assert_eq!(scopes[0].kind, ScopeKind::Global);
        assert_eq!(scopes.len(), 3);
        assert!(scopes[1].available);
        assert!(!scopes[2].available);
        assert_eq!(scopes[2].name, "app");
    }
}
