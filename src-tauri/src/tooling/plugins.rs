use std::path::{Path, PathBuf};

use serde_json::Value;

use super::frontmatter::string_field;
use super::scan::{scan_root, Namespace};
use super::settings::read_json;
use super::{
    mcp, Kind, Origin, PluginContents, PluginInfo, SourceState, SourceStatus, State, ToolItem,
};

#[derive(Debug, Clone)]
pub struct Installed {
    pub key: String,
    pub name: String,
    pub marketplace: String,
    pub scope: String,
    pub project_path: Option<String>,
    pub install_path: PathBuf,
    pub version: Option<String>,
    pub installed_at: Option<String>,
    pub last_updated: Option<String>,
}

fn str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(String::from)
}

pub fn read_installed(file: &Path) -> (Vec<Installed>, SourceStatus) {
    let root = match read_json(file) {
        Ok(Some(v)) => v,
        Ok(None) => {
            return (
                Vec::new(),
                SourceStatus::new(file, SourceState::Missing, None),
            )
        }
        Err(e) => {
            return (
                Vec::new(),
                SourceStatus::new(file, SourceState::Error, Some(e)),
            )
        }
    };
    let mut out = Vec::new();
    if let Some(plugins) = root.get("plugins").and_then(Value::as_object) {
        for (key, entries) in plugins {
            let (name, marketplace) = key.split_once('@').unwrap_or((key.as_str(), ""));
            for entry in entries.as_array().into_iter().flatten() {
                let Some(install_path) = str_field(entry, "installPath") else {
                    continue;
                };
                out.push(Installed {
                    key: key.clone(),
                    name: name.to_string(),
                    marketplace: marketplace.to_string(),
                    scope: str_field(entry, "scope").unwrap_or_else(|| "user".into()),
                    project_path: str_field(entry, "projectPath"),
                    install_path: PathBuf::from(install_path),
                    version: str_field(entry, "version"),
                    installed_at: str_field(entry, "installedAt"),
                    last_updated: str_field(entry, "lastUpdated"),
                });
            }
        }
    }
    (out, SourceStatus::new(file, SourceState::Ok, None))
}

fn count_hooks(hooks: Option<&Value>) -> usize {
    hooks
        .and_then(Value::as_object)
        .map(|events| {
            events
                .values()
                .filter_map(Value::as_array)
                .flatten()
                .map(|group| {
                    group
                        .get("hooks")
                        .and_then(Value::as_array)
                        .map_or(0, Vec::len)
                })
                .sum()
        })
        .unwrap_or(0)
}

pub struct PluginScan {
    pub plugin: ToolItem,
    pub children: Vec<ToolItem>,
    pub sources: Vec<SourceStatus>,
}

pub fn scan_plugin(p: &Installed) -> PluginScan {
    let mut plugin = ToolItem::new(Kind::Plugin, Origin::Plugin, p.name.clone(), p.key.clone());
    plugin.plugin_key = Some(p.key.clone());
    let mut sources = Vec::new();
    let mut children = Vec::new();
    let mut contents = PluginContents::default();

    if !p.install_path.is_dir() {
        plugin.state = State::Unavailable;
        plugin.error = Some(format!(
            "plugin folder not found: {}",
            p.install_path.display()
        ));
        plugin.file_path = Some(p.install_path.to_string_lossy().into_owned());
    } else {
        let manifest_path = p.install_path.join(".claude-plugin").join("plugin.json");
        let manifest = match read_json(&manifest_path) {
            Ok(m) => m,
            Err(e) => {
                sources.push(SourceStatus::new(
                    &manifest_path,
                    SourceState::Error,
                    Some(e.clone()),
                ));
                plugin.state = State::Error;
                plugin.error = Some(e);
                None
            }
        };
        plugin.file_path = Some(
            if manifest.is_some() {
                manifest_path.clone()
            } else {
                p.install_path.clone()
            }
            .to_string_lossy()
            .into_owned(),
        );
        if let Some(obj) = manifest.as_ref().and_then(Value::as_object) {
            plugin.description = string_field(obj, "description");
        }

        let ns = Namespace {
            plugin_name: &p.name,
            plugin_key: &p.key,
        };
        let found = scan_root(&p.install_path, Origin::Plugin, Some(&ns));
        children.extend(found.items);

        let mcp_path = p.install_path.join(".mcp.json");
        match read_json(&mcp_path) {
            Ok(Some(v)) => children.extend(mcp::servers(
                v.get("mcpServers"),
                Origin::Plugin,
                &mcp_path,
                &format!("{} › .mcp.json", p.key),
                Some(&ns),
            )),
            Ok(None) => {}
            Err(e) => sources.push(SourceStatus::new(&mcp_path, SourceState::Error, Some(e))),
        }
        if let Some(m) = manifest.as_ref() {
            children.extend(mcp::servers(
                m.get("mcpServers"),
                Origin::Plugin,
                &manifest_path,
                &format!("{} › plugin.json › mcpServers", p.key),
                Some(&ns),
            ));
        }

        let hooks_file = read_json(&p.install_path.join("hooks").join("hooks.json"))
            .ok()
            .flatten();
        contents.hooks = count_hooks(manifest.as_ref().and_then(|m| m.get("hooks")))
            + count_hooks(hooks_file.as_ref().and_then(|h| h.get("hooks")));
    }

    for c in &children {
        match c.kind {
            Kind::Skill => contents.skills += 1,
            Kind::Command => contents.commands += 1,
            Kind::Agent => contents.agents += 1,
            Kind::Mcp => contents.mcp += 1,
            Kind::Plugin => {}
        }
    }
    plugin.plugin = Some(PluginInfo {
        version: p.version.clone(),
        marketplace: p.marketplace.clone(),
        installed_at: p.installed_at.clone(),
        last_updated: p.last_updated.clone(),
        install_path: p.install_path.to_string_lossy().into_owned(),
        contents,
    });
    PluginScan {
        plugin,
        children,
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

    #[test]
    fn reads_installed_and_plugin_contents() {
        let home = tempfile::tempdir().unwrap();
        let install = home.path().join("cache/pony/1.0");
        write(
            &install.join(".claude-plugin/plugin.json"),
            r#"{"name":"pony","description":"Lazy","hooks":{"SessionStart":[{"hooks":[{"type":"command"},{"type":"command"}]}]}}"#,
        );
        write(
            &install.join("skills/lazy/SKILL.md"),
            "---\nname: lazy\n---\n",
        );
        write(&install.join("commands/help.md"), "Help");
        write(
            &install.join(".mcp.json"),
            r#"{"mcpServers":{"srv":{"command":"node"}}}"#,
        );
        write(
            &install.join("hooks/hooks.json"),
            r#"{"hooks":{"Stop":[{"hooks":[{"type":"command"}]}]}}"#,
        );
        let file = home.path().join("installed_plugins.json");
        let json = serde_json::json!({
            "version": 2,
            "plugins": {
                "pony@mkt": [{ "scope": "user", "installPath": install, "version": "1.0" }],
                "gone@mkt": [{ "scope": "project", "projectPath": "C:\\p", "installPath": home.path().join("nope") }]
            }
        });
        fs::write(&file, json.to_string()).unwrap();

        let (installed, status) = read_installed(&file);
        assert_eq!(status.status, SourceState::Ok);
        assert_eq!(installed.len(), 2);

        let pony = installed.iter().find(|p| p.key == "pony@mkt").unwrap();
        let scan = scan_plugin(pony);
        assert_eq!(scan.plugin.description.as_deref(), Some("Lazy"));
        let info = scan.plugin.plugin.as_ref().unwrap();
        assert_eq!(info.marketplace, "mkt");
        assert_eq!(
            (
                info.contents.skills,
                info.contents.commands,
                info.contents.mcp,
                info.contents.hooks
            ),
            (1, 1, 1, 3)
        );
        assert!(scan.children.iter().any(|c| c.qualified_name == "pony:srv"));

        let gone = installed.iter().find(|p| p.key == "gone@mkt").unwrap();
        assert_eq!(gone.project_path.as_deref(), Some("C:\\p"));
        assert_eq!(scan_plugin(gone).plugin.state, State::Unavailable);
    }

    #[test]
    fn missing_registry_is_missing_source() {
        let dir = tempfile::tempdir().unwrap();
        let (items, status) = read_installed(&dir.path().join("installed_plugins.json"));
        assert!(items.is_empty());
        assert_eq!(status.status, SourceState::Missing);
    }
}
