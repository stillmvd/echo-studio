use std::collections::HashSet;
use std::fs;
use std::hash::{DefaultHasher, Hasher};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use super::paths::same_project;
use super::plugins::Installed;
use super::scan::{scan_root, Namespace};
use super::{Kind, Origin, ScopeRef};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CopyScopeKind {
    Global,
    Project,
    Plugin,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyScope {
    pub kind: CopyScopeKind,
    pub path: Option<String>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCopy {
    pub kind: Kind,
    pub name: String,
    pub scope: CopyScope,
    pub file_path: String,
    pub hash: Option<String>,
    pub modified_ms: Option<u64>,
}

fn fingerprint(path: &Path) -> (Option<String>, Option<u64>) {
    let Ok(bytes) = fs::read(path) else {
        return (None, None);
    };
    let mut h = DefaultHasher::new();
    h.write(&bytes);
    let modified = fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);
    (Some(format!("{:016x}", h.finish())), modified)
}

fn collect(
    root: &Path,
    origin: Origin,
    ns: Option<&Namespace>,
    scope: &CopyScope,
    out: &mut Vec<ToolCopy>,
) {
    for item in scan_root(root, origin, ns).items {
        if !matches!(item.kind, Kind::Skill | Kind::Command | Kind::Agent) {
            continue;
        }
        let Some(file) = item.file_path else {
            continue;
        };
        let (hash, modified_ms) = fingerprint(Path::new(&file));
        out.push(ToolCopy {
            kind: item.kind,
            name: item.name,
            scope: scope.clone(),
            file_path: file,
            hash,
            modified_ms,
        });
    }
}

pub fn list_copies(claude: &Path, scopes: &[ScopeRef], plugins: &[Installed]) -> Vec<ToolCopy> {
    let mut out = Vec::new();
    let global = CopyScope {
        kind: CopyScopeKind::Global,
        path: None,
        label: "Global".into(),
    };
    collect(claude, Origin::User, None, &global, &mut out);

    let claude_str = claude.to_string_lossy();
    for s in scopes.iter().filter(|s| s.available) {
        let Some(path) = s.path.as_deref() else {
            continue;
        };
        let root = PathBuf::from(path).join(".claude");
        if same_project(&root.to_string_lossy(), &claude_str) {
            continue;
        }
        let scope = CopyScope {
            kind: CopyScopeKind::Project,
            path: Some(path.to_string()),
            label: s.name.clone(),
        };
        collect(&root, Origin::Project, None, &scope, &mut out);
    }

    let mut seen: HashSet<&Path> = HashSet::new();
    for p in plugins {
        if !seen.insert(p.install_path.as_path()) {
            continue;
        }
        let ns = Namespace {
            plugin_name: &p.name,
            plugin_key: &p.key,
        };
        let scope = CopyScope {
            kind: CopyScopeKind::Plugin,
            path: Some(p.install_path.to_string_lossy().into_owned()),
            label: p.name.clone(),
        };
        collect(&p.install_path, Origin::Plugin, Some(&ns), &scope, &mut out);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tooling::effective::project_scope;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn indexes_global_projects_and_plugins_with_hashes() {
        let dir = tempfile::tempdir().unwrap();
        let claude = dir.path().join(".claude");
        let a = dir.path().join("a");
        let b = dir.path().join("b");
        let plugin = dir.path().join("plug");
        write(&claude.join("commands/stand.md"), "one");
        write(&a.join(".claude/commands/stand.md"), "one");
        write(&b.join(".claude/commands/stand.md"), "two");
        write(
            &b.join(".claude/skills/tidy/SKILL.md"),
            "---\nname: tidy\n---\n",
        );
        write(
            &plugin.join("skills/stand/SKILL.md"),
            "---\nname: stand\n---\n",
        );

        let scopes = vec![
            project_scope(&a.to_string_lossy()),
            project_scope(&b.to_string_lossy()),
        ];
        let plugins = vec![Installed {
            key: "plug@mkt".into(),
            name: "plug".into(),
            marketplace: "mkt".into(),
            scope: "user".into(),
            project_path: None,
            install_path: plugin.clone(),
            version: None,
            installed_at: None,
            last_updated: None,
        }];
        let copies = list_copies(&claude, &scopes, &plugins);

        let stand: Vec<&ToolCopy> = copies
            .iter()
            .filter(|c| c.kind == Kind::Command && c.name == "stand")
            .collect();
        assert_eq!(stand.len(), 3);
        assert_eq!(stand[0].scope.kind, CopyScopeKind::Global);
        assert_eq!(stand[0].hash, stand[1].hash);
        assert_ne!(stand[0].hash, stand[2].hash);
        assert!(stand.iter().all(|c| c.modified_ms.is_some()));

        let plug = copies
            .iter()
            .find(|c| c.scope.kind == CopyScopeKind::Plugin)
            .unwrap();
        assert_eq!(
            (plug.kind, plug.name.as_str(), plug.scope.label.as_str()),
            (Kind::Skill, "stand", "plug")
        );
        assert!(copies
            .iter()
            .any(|c| c.name == "tidy" && c.scope.label == "b"));
    }
}
