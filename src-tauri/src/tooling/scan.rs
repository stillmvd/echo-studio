use std::fs;
use std::path::{Path, PathBuf};

use super::frontmatter::{first_paragraph_line, parse, string_field};
use super::{Kind, Origin, SourceState, SourceStatus, State, ToolItem};

pub struct Namespace<'a> {
    pub plugin_name: &'a str,
    pub plugin_key: &'a str,
}

#[derive(Default)]
pub struct Found {
    pub items: Vec<ToolItem>,
    pub sources: Vec<SourceStatus>,
}

pub fn scan_root(root: &Path, origin: Origin, ns: Option<&Namespace>) -> Found {
    let mut found = Found::default();
    scan_skills(&root.join("skills"), origin, ns, &mut found);
    scan_markdown_tree(
        &root.join("commands"),
        Kind::Command,
        origin,
        ns,
        &mut found,
    );
    scan_markdown_tree(&root.join("agents"), Kind::Agent, origin, ns, &mut found);
    found
}

fn note_dir(dir: &Path, ns: Option<&Namespace>, found: &mut Found) -> bool {
    if dir.is_dir() {
        if ns.is_none() {
            found
                .sources
                .push(SourceStatus::new(dir, SourceState::Ok, None));
        }
        true
    } else {
        if ns.is_none() {
            found
                .sources
                .push(SourceStatus::new(dir, SourceState::Missing, None));
        }
        false
    }
}

fn scan_skills(dir: &Path, origin: Origin, ns: Option<&Namespace>, found: &mut Found) {
    if !note_dir(dir, ns, found) {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut dirs: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
    dirs.sort();
    for skill_dir in dirs {
        let file = skill_dir.join("SKILL.md");
        if !file.is_file() {
            continue;
        }
        let dir_name = file_stem(&skill_dir);
        found
            .items
            .push(read_item(&file, Kind::Skill, origin, ns, dir_name));
    }
}

fn scan_markdown_tree(
    dir: &Path,
    kind: Kind,
    origin: Origin,
    ns: Option<&Namespace>,
    found: &mut Found,
) {
    if !note_dir(dir, ns, found) {
        return;
    }
    let mut files = Vec::new();
    collect_md(dir, &mut files);
    files.sort();
    for file in files {
        let fallback = match kind {
            Kind::Command => file
                .strip_prefix(dir)
                .unwrap_or(&file)
                .with_extension("")
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join(":"),
            _ => file_stem(&file),
        };
        found
            .items
            .push(read_item(&file, kind, origin, ns, fallback));
    }
}

fn collect_md(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_md(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            out.push(path);
        }
    }
}

fn file_stem(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn read_item(
    file: &Path,
    kind: Kind,
    origin: Origin,
    ns: Option<&Namespace>,
    fallback_name: String,
) -> ToolItem {
    let parsed = fs::read_to_string(file)
        .map_err(|e| format!("read: {e}"))
        .and_then(|t| parse(&t));
    let (name, description, fields, error) = match parsed {
        Ok(p) => {
            let name = match kind {
                Kind::Command => fallback_name,
                _ => string_field(&p.fields, "name").unwrap_or(fallback_name),
            };
            let description = string_field(&p.fields, "description")
                .or_else(|| string_field(&p.fields, "when_to_use"))
                .or_else(|| first_paragraph_line(&p.body));
            (name, description, Some(p.fields), None)
        }
        Err(e) => (fallback_name, None, None, Some(e)),
    };
    let qualified = match ns {
        Some(n) => format!("{}:{name}", n.plugin_name),
        None => name.clone(),
    };
    let mut item = ToolItem::new(kind, origin, name, qualified);
    item.description = description;
    item.front_matter = fields;
    item.file_path = Some(file.to_string_lossy().into_owned());
    item.plugin_key = ns.map(|n| n.plugin_key.to_string());
    if let Some(e) = error {
        item.state = State::Error;
        item.error = Some(e);
    }
    item
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn scans_skills_commands_agents() {
        let root = tempfile::tempdir().unwrap();
        let r = root.path();
        write(
            &r.join("skills/alpha/SKILL.md"),
            "---\nname: alpha-skill\ndescription: Does alpha\n---\nbody",
        );
        write(&r.join("skills/no-file/README.md"), "x");
        write(&r.join("skills/beta/SKILL.md"), "# Beta\n\nFirst line.");
        write(
            &r.join("commands/phase/plan.md"),
            "---\ndescription: Plan\n---\n",
        );
        write(&r.join("commands/commit.md"), "Commit it");
        write(&r.join("agents/sub/reviewer.md"), "---\nname: rev\n---\n");
        write(&r.join("agents/broken.md"), "---\nfoo: [x\n---\n");

        let found = scan_root(r, Origin::User, None);
        let names: Vec<(Kind, &str)> = found
            .items
            .iter()
            .map(|i| (i.kind, i.qualified_name.as_str()))
            .collect();
        assert_eq!(
            names,
            vec![
                (Kind::Skill, "alpha-skill"),
                (Kind::Skill, "beta"),
                (Kind::Command, "commit"),
                (Kind::Command, "phase:plan"),
                (Kind::Agent, "broken"),
                (Kind::Agent, "rev"),
            ]
        );
        assert_eq!(found.items[1].description.as_deref(), Some("First line."));
        assert_eq!(found.items[4].state, State::Error);
        assert_eq!(found.items[0].id, "skill:user:alpha-skill");
        assert!(found.sources.iter().all(|s| s.status == SourceState::Ok));
    }

    #[test]
    fn missing_folders_are_sources_not_errors() {
        let root = tempfile::tempdir().unwrap();
        let found = scan_root(root.path(), Origin::Project, None);
        assert!(found.items.is_empty());
        assert_eq!(found.sources.len(), 3);
        assert!(found
            .sources
            .iter()
            .all(|s| s.status == SourceState::Missing));
    }

    #[test]
    fn plugin_items_get_namespace() {
        let root = tempfile::tempdir().unwrap();
        write(
            &root.path().join("skills/x/SKILL.md"),
            "---\nname: x\n---\n",
        );
        let ns = Namespace {
            plugin_name: "pony",
            plugin_key: "pony@mkt",
        };
        let found = scan_root(root.path(), Origin::Plugin, Some(&ns));
        assert_eq!(found.items[0].qualified_name, "pony:x");
        assert_eq!(found.items[0].plugin_key.as_deref(), Some("pony@mkt"));
        assert!(found.sources.is_empty());
    }
}
