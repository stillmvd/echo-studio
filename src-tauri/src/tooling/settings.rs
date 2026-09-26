use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use serde_json::Value;

use super::paths::same_project;

pub fn read_json(path: &Path) -> Result<Option<Value>, String> {
    match fs::read_to_string(path) {
        Ok(text) => {
            let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
            serde_json::from_str(text)
                .map(Some)
                .map_err(|e| format!("{}: {e}", path.display()))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

pub fn project_entry<'a>(claude_json: &'a Value, project: &str) -> Option<(&'a str, &'a Value)> {
    claude_json
        .get("projects")?
        .as_object()?
        .iter()
        .find(|(k, _)| same_project(k, project))
        .map(|(k, v)| (k.as_str(), v))
}

#[derive(Debug, Default)]
pub struct Toggles {
    pub enabled_plugins: HashMap<String, bool>,
    pub skill_overrides: HashMap<String, String>,
    pub disabled_mcpjson: HashSet<String>,
    pub enabled_mcpjson: HashSet<String>,
    pub enable_all_project_mcp: bool,
    pub disabled_mcp: HashSet<String>,
}

fn names<'a>(value: &'a Value, key: &str) -> impl Iterator<Item = String> + 'a {
    value
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(String::from)
}

impl Toggles {
    pub fn merge_settings(layers: &[Option<&Value>]) -> Self {
        let mut t = Toggles::default();
        for layer in layers.iter().flatten() {
            if let Some(map) = layer.get("enabledPlugins").and_then(Value::as_object) {
                for (k, v) in map {
                    if let Some(b) = v.as_bool() {
                        t.enabled_plugins.insert(k.clone(), b);
                    }
                }
            }
            if let Some(map) = layer.get("skillOverrides").and_then(Value::as_object) {
                for (k, v) in map {
                    if let Some(s) = v.as_str() {
                        t.skill_overrides.insert(k.clone(), s.to_string());
                    }
                }
            }
            if let Some(b) = layer
                .get("enableAllProjectMcpServers")
                .and_then(Value::as_bool)
            {
                t.enable_all_project_mcp = b;
            }
            t.disabled_mcpjson
                .extend(names(layer, "disabledMcpjsonServers"));
            t.enabled_mcpjson
                .extend(names(layer, "enabledMcpjsonServers"));
        }
        t
    }

    pub fn add_claude_json(&mut self, root: Option<&Value>, project: Option<&str>) {
        let Some(root) = root else { return };
        self.disabled_mcp.extend(names(root, "disabledMcpServers"));
        if let Some((_, entry)) = project.and_then(|p| project_entry(root, p)) {
            self.disabled_mcp.extend(names(entry, "disabledMcpServers"));
            self.disabled_mcpjson
                .extend(names(entry, "disabledMcpjsonServers"));
            self.enabled_mcpjson
                .extend(names(entry, "enabledMcpjsonServers"));
        }
    }

    pub fn plugin_enabled(&self, key: &str) -> bool {
        self.enabled_plugins.get(key).copied().unwrap_or(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn higher_layer_wins_per_key() {
        let user = json!({
            "enabledPlugins": { "a@m": true, "b@m": true },
            "skillOverrides": { "x": "off", "y": "off" },
            "enableAllProjectMcpServers": true
        });
        let project =
            json!({ "enabledPlugins": { "a@m": false }, "disabledMcpjsonServers": ["p1"] });
        let local = json!({
            "enabledPlugins": { "a@m": true },
            "skillOverrides": { "y": "name-only" },
            "enableAllProjectMcpServers": false,
            "disabledMcpjsonServers": ["p2"]
        });
        let t = Toggles::merge_settings(&[Some(&user), Some(&project), None, Some(&local)]);
        assert!(t.plugin_enabled("a@m"));
        assert!(t.plugin_enabled("b@m"));
        assert!(t.plugin_enabled("unknown@m"));
        assert_eq!(t.skill_overrides["x"], "off");
        assert_eq!(t.skill_overrides["y"], "name-only");
        assert!(!t.enable_all_project_mcp);
        assert!(t.disabled_mcpjson.contains("p1") && t.disabled_mcpjson.contains("p2"));
    }

    #[test]
    fn claude_json_project_entry_matches_normalized_path() {
        let root = json!({
            "disabledMcpServers": ["g"],
            "projects": { "c:/Work/App": { "disabledMcpServers": ["l"], "enabledMcpjsonServers": ["e"] } }
        });
        let mut t = Toggles::default();
        t.add_claude_json(Some(&root), Some("C:\\Work\\App\\"));
        assert!(t.disabled_mcp.contains("g") && t.disabled_mcp.contains("l"));
        assert!(t.enabled_mcpjson.contains("e"));
        assert_eq!(
            project_entry(&root, "C:\\work\\app").unwrap().0,
            "c:/Work/App"
        );
    }

    #[test]
    fn read_json_missing_is_none_and_broken_is_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_json(&dir.path().join("none.json")).unwrap().is_none());
        let bad = dir.path().join("bad.json");
        fs::write(&bad, "{ nope").unwrap();
        assert!(read_json(&bad).is_err());
    }
}
