use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

const MARKERS: [&str; 7] = [
    ".git",
    "package.json",
    "manifest.json",
    "index.html",
    "CLAUDE.md",
    ".gitignore",
    ".vscode",
];
const EXCLUDE: [&str; 3] = ["Breeze-main", "Smart Control-main", "node_modules"];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTree {
    pub groups: Vec<ProjectGroup>,
    pub roots: Vec<Project>,
    pub folders: Vec<Project>,
    pub root: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroup {
    pub name: String,
    pub path: String,
    pub icon: Option<String>,
    pub projects: Vec<Project>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub path: String,
    pub name: String,
    pub group: Option<String>,
    pub icon: Option<String>,
    pub dev: Option<DevCommand>,
    pub mcp: Option<McpProfile>,
    pub has_claude_md: bool,
    pub folder: bool,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DevKind {
    Tauri,
    Web,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DevCommand {
    pub command: String,
    pub kind: DevKind,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct McpProfile {
    pub profile: Option<String>,
    pub headless: bool,
}

fn visible_dirs(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
        .map(|e| e.path())
        .filter(|p| {
            let name = file_name(p);
            !name.starts_with('.')
                && !name.starts_with('_')
                && !EXCLUDE.contains(&name.as_str())
                && !p.join(".git").is_file()
        })
        .collect();
    dirs.sort_by_key(|p| file_name(p).to_lowercase());
    dirs
}

fn file_name(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn is_project(dir: &Path) -> bool {
    MARKERS.iter().any(|m| dir.join(m).exists())
}

pub fn scan(root: &Path) -> ProjectTree {
    let icons = root.join("_maintenance").join("folder-icons");
    let mut groups = Vec::new();
    let mut roots = Vec::new();
    let mut folders = vec![folder(root, &icons)];
    for top in visible_dirs(root) {
        if is_project(&top) {
            roots.push(project(&top, None, &icons));
            continue;
        }
        let name = file_name(&top);
        let projects = visible_dirs(&top)
            .iter()
            .map(|p| project(p, Some(name.clone()), &icons))
            .collect();
        groups.push(ProjectGroup {
            icon: icon(&top, &icons),
            path: top.to_string_lossy().into_owned(),
            name,
            projects,
        });
        folders.push(folder(&top, &icons));
    }
    ProjectTree {
        groups,
        roots,
        folders,
        root: root.to_string_lossy().into_owned(),
    }
}

fn project(dir: &Path, group: Option<String>, icons: &Path) -> Project {
    Project {
        path: dir.to_string_lossy().into_owned(),
        name: file_name(dir),
        group,
        icon: icon(dir, icons),
        dev: dev_args(dir).map(|(args, kind)| DevCommand {
            command: args.join(" "),
            kind,
        }),
        mcp: mcp_profile(dir),
        has_claude_md: dir.join("CLAUDE.md").is_file(),
        folder: false,
    }
}

fn folder(dir: &Path, icons: &Path) -> Project {
    Project {
        path: dir.to_string_lossy().into_owned(),
        name: file_name(dir),
        group: None,
        icon: icon(dir, icons),
        dev: None,
        mcp: mcp_profile(dir),
        has_claude_md: dir.join("CLAUDE.md").is_file(),
        folder: true,
    }
}

pub fn decode_ini(bytes: &[u8]) -> String {
    match bytes {
        [0xFF, 0xFE, rest @ ..] => {
            let units: Vec<u16> = rest
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            String::from_utf16_lossy(&units)
        }
        _ => String::from_utf8_lossy(bytes).into_owned(),
    }
}

pub fn icon_name(ini: &str) -> Option<String> {
    let value = ini.lines().find_map(|line| {
        let (key, value) = line.trim().trim_start_matches('\u{feff}').split_once('=')?;
        key.trim()
            .eq_ignore_ascii_case("IconResource")
            .then(|| value.trim().to_string())
    })?;
    let file = value.split(',').next()?.rsplit(['\\', '/']).next()?;
    let (stem, ext) = file.rsplit_once('.')?;
    ext.eq_ignore_ascii_case("ico").then(|| stem.to_string())
}

fn icon(dir: &Path, icons: &Path) -> Option<String> {
    let ini = fs::read(dir.join("desktop.ini")).ok()?;
    let name = icon_name(&decode_ini(&ini))?;
    let svg = fs::read_to_string(icons.join(format!("{name}-small.svg"))).ok()?;
    Some(svg.trim().to_string())
}

pub fn dev_args(dir: &Path) -> Option<(Vec<String>, DevKind)> {
    let text = fs::read_to_string(dir.join("package.json")).ok()?;
    let pkg: Value = serde_json::from_str(&text).ok()?;
    let scripts = pkg.get("scripts")?.as_object()?;
    let pm: &[&str] = if dir.join("pnpm-lock.yaml").exists() {
        &["pnpm"]
    } else if dir.join("yarn.lock").exists() {
        &["yarn"]
    } else if dir.join("bun.lock").exists() || dir.join("bun.lockb").exists() {
        &["bun", "run"]
    } else {
        &["npm", "run"]
    };
    let with = |tail: &[&str]| pm.iter().chain(tail).map(|s| s.to_string()).collect();
    if dir.join("src-tauri").is_dir() && scripts.contains_key("tauri") {
        let tail: &[&str] = if pm == ["npm", "run"] {
            &["tauri", "--", "dev"]
        } else {
            &["tauri", "dev"]
        };
        return Some((with(tail), DevKind::Tauri));
    }
    ["dev", "start"]
        .into_iter()
        .find(|s| scripts.contains_key(*s))
        .map(|s| (with(&[s]), DevKind::Web))
}

fn mcp_profile(dir: &Path) -> Option<McpProfile> {
    let text = fs::read_to_string(dir.join(".mcp.json")).ok()?;
    let cfg: Value = serde_json::from_str(&text).ok()?;
    let args: Vec<&str> = cfg
        .get("mcpServers")?
        .get("chrome-devtools")?
        .get("args")
        .and_then(|a| a.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    let profile = args
        .iter()
        .find_map(|a| a.strip_prefix("--user-data-dir="))
        .and_then(|d| d.rsplit(['\\', '/']).find(|s| !s.is_empty()))
        .map(String::from);
    Some(McpProfile {
        profile,
        headless: args.contains(&"--headless"),
    })
}

fn normalize(path: &str) -> String {
    path.replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

pub fn same_path(a: &str, b: &str) -> bool {
    normalize(a) == normalize(b)
}

pub fn is_within(path: &str, dir: &str) -> bool {
    let (p, d) = (normalize(path), normalize(dir));
    p == d || p.starts_with(&format!("{d}\\"))
}

pub fn all_projects(tree: &ProjectTree) -> impl Iterator<Item = &Project> {
    tree.roots
        .iter()
        .chain(tree.groups.iter().flat_map(|g| g.projects.iter()))
}

pub fn places(tree: &ProjectTree) -> impl Iterator<Item = &Project> {
    all_projects(tree).chain(tree.folders.iter())
}

pub fn place_for<'a>(tree: &'a ProjectTree, path: &str) -> Option<&'a Project> {
    places(tree)
        .filter(|p| is_within(path, &p.path))
        .max_by_key(|p| p.path.len())
}

fn ensure_in<'a>(mut list: impl Iterator<Item = &'a Project>, path: &str) -> Option<Project> {
    list.find(|p| same_path(&p.path, path)).cloned()
}

pub fn ensure_project(path: &str) -> Result<Project, String> {
    let root = super::projects_root().ok_or("Не найдена папка Projects")?;
    let tree = scan(&root);
    ensure_in(all_projects(&tree), path).ok_or_else(|| format!("Неизвестный проект: {path}"))
}

pub fn ensure_place(path: &str) -> Result<Project, String> {
    let root = super::projects_root().ok_or("Не найдена папка Projects")?;
    let tree = scan(&root);
    ensure_in(places(&tree), path).ok_or_else(|| format!("Неизвестный проект или папка: {path}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk(root: &Path, rel: &str) -> PathBuf {
        let p = root.join(rel);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn builds_groups_and_roots() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        mk(root, "Windows Apps/Echo");
        mk(root, "Windows Apps/booked");
        mk(root, "Windows Apps/_old");
        mk(root, "Windows Apps/node_modules");
        mk(root, "ProHouse/Breeze-main");
        mk(root, "ProHouse/Breeze");
        let solo = mk(root, "Solo");
        fs::write(solo.join("CLAUDE.md"), "x").unwrap();
        mk(root, "_maintenance/folder-icons");
        mk(root, "_archived/x");
        mk(root, ".hidden");

        let tree = scan(root);
        assert_eq!(tree.root, root.to_string_lossy());
        assert_eq!(tree.roots.len(), 1);
        assert_eq!(tree.roots[0].name, "Solo");
        assert!(tree.roots[0].has_claude_md);
        let names: Vec<_> = tree.groups.iter().map(|g| g.name.as_str()).collect();
        assert_eq!(names, ["ProHouse", "Windows Apps"]);
        let apps: Vec<_> = tree.groups[1]
            .projects
            .iter()
            .map(|p| p.name.as_str())
            .collect();
        assert_eq!(apps, ["booked", "Echo"]);
        assert_eq!(tree.groups[0].projects.len(), 1);
        assert_eq!(
            tree.groups[1].projects[0].group.as_deref(),
            Some("Windows Apps")
        );
        let folders: Vec<_> = tree.folders.iter().map(|f| f.path.as_str()).collect();
        let apps_dir = root.join("Windows Apps").to_string_lossy().into_owned();
        assert_eq!(folders[0], tree.root);
        assert!(folders.contains(&apps_dir.as_str()));
        assert!(tree.folders.iter().all(|f| f.folder && f.dev.is_none()));
        assert!(all_projects(&tree).all(|p| !p.folder));
        assert_eq!(tree.groups[1].path, apps_dir);
        let at = |rel: &str| {
            place_for(&tree, &root.join(rel).to_string_lossy())
                .map(|p| p.path.clone())
                .unwrap()
        };
        assert_eq!(at("Windows Apps/Echo/src"), tree.groups[1].projects[1].path);
        assert_eq!(at("Windows Apps"), apps_dir);
        assert_eq!(at("_maintenance"), tree.root);
    }

    #[test]
    fn worktree_folder_is_skipped() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        mk(root, "Apps/Echo/.git");
        let wt = mk(root, "Apps/Echo-wt");
        fs::write(wt.join(".git"), "gitdir: C:/x/.git/worktrees/wt").unwrap();
        let top = mk(root, "Top-wt");
        fs::write(top.join(".git"), "gitdir: C:/x").unwrap();
        mk(root, "Solo/.git");

        let tree = scan(root);
        let roots: Vec<_> = tree.roots.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(roots, ["Solo"]);
        let apps: Vec<_> = tree.groups[0]
            .projects
            .iter()
            .map(|p| p.name.as_str())
            .collect();
        assert_eq!(apps, ["Echo"]);
    }

    #[test]
    fn icon_from_utf16_desktop_ini() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let icons = mk(root, "_maintenance/folder-icons");
        fs::write(icons.join("echo-studio-small.svg"), " <svg/>\n").unwrap();
        let proj = mk(root, "Echo");
        let text = "[.ShellClassInfo]\r\nIconResource=C:\\x\\ico\\echo-studio.ico,0\r\n";
        let mut bytes = vec![0xFF, 0xFE];
        bytes.extend(text.encode_utf16().flat_map(|u| u.to_le_bytes()));
        fs::write(proj.join("desktop.ini"), bytes).unwrap();
        assert_eq!(icon(&proj, &icons).as_deref(), Some("<svg/>"));
    }

    #[test]
    fn icon_name_variants() {
        assert_eq!(
            icon_name("[.ShellClassInfo]\nIconResource=C:\\a\\b.ico,0").as_deref(),
            Some("b")
        );
        assert_eq!(icon_name("iconresource = C:/a/B.ICO").as_deref(), Some("B"));
        assert_eq!(icon_name("IconResource=C:\\a\\b.dll,3"), None);
        assert_eq!(icon_name("[.ShellClassInfo]"), None);
    }

    #[test]
    fn decodes_utf8_ini_with_and_without_bom() {
        let plain = b"IconResource=C:\\a\\x.ico,0";
        assert_eq!(icon_name(&decode_ini(plain)).as_deref(), Some("x"));
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(plain);
        assert_eq!(icon_name(&decode_ini(&bom)).as_deref(), Some("x"));
    }

    #[test]
    fn missing_svg_gives_no_icon() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = mk(tmp.path(), "P");
        fs::write(proj.join("desktop.ini"), "IconResource=C:\\a\\none.ico,0").unwrap();
        assert_eq!(icon(&proj, &tmp.path().join("icons")), None);
    }

    fn pkg(dir: &Path, scripts: &str) {
        fs::write(
            dir.join("package.json"),
            format!("{{\"scripts\":{{{scripts}}}}}"),
        )
        .unwrap();
    }

    #[test]
    fn dev_command_rules() {
        let tmp = tempfile::tempdir().unwrap();
        let tauri = mk(tmp.path(), "t");
        pkg(&tauri, "\"tauri\":\"tauri\",\"dev\":\"vite\"");
        mk(&tauri, "src-tauri");
        fs::write(tauri.join("pnpm-lock.yaml"), "").unwrap();
        assert_eq!(
            dev_args(&tauri),
            Some((
                vec!["pnpm".into(), "tauri".into(), "dev".into()],
                DevKind::Tauri
            ))
        );

        let npm_tauri = mk(tmp.path(), "nt");
        pkg(&npm_tauri, "\"tauri\":\"tauri\"");
        mk(&npm_tauri, "src-tauri");
        assert_eq!(
            dev_args(&npm_tauri).unwrap().0,
            ["npm", "run", "tauri", "--", "dev"]
        );

        let web = mk(tmp.path(), "w");
        pkg(&web, "\"start\":\"node .\"");
        fs::write(web.join("bun.lockb"), "").unwrap();
        assert_eq!(
            dev_args(&web),
            Some((
                vec!["bun".into(), "run".into(), "start".into()],
                DevKind::Web
            ))
        );

        let yarn = mk(tmp.path(), "y");
        pkg(&yarn, "\"dev\":\"vite\",\"start\":\"x\"");
        fs::write(yarn.join("yarn.lock"), "").unwrap();
        assert_eq!(dev_args(&yarn).unwrap().0, ["yarn", "dev"]);

        let none = mk(tmp.path(), "n");
        pkg(&none, "\"build\":\"x\"");
        assert_eq!(dev_args(&none), None);

        let broken = mk(tmp.path(), "b");
        fs::write(broken.join("package.json"), "{oops").unwrap();
        assert_eq!(dev_args(&broken), None);
    }

    #[test]
    fn mcp_profile_from_args() {
        let tmp = tempfile::tempdir().unwrap();
        let p = mk(tmp.path(), "p");
        fs::write(
            p.join(".mcp.json"),
            r#"{"mcpServers":{"chrome-devtools":{"args":["x","--headless","--user-data-dir=C:\\c\\chrome-profiles\\echo-studio"]}}}"#,
        )
        .unwrap();
        assert_eq!(
            mcp_profile(&p),
            Some(McpProfile {
                profile: Some("echo-studio".into()),
                headless: true
            })
        );
        fs::write(p.join(".mcp.json"), r#"{"mcpServers":{"other":{}}}"#).unwrap();
        assert_eq!(mcp_profile(&p), None);
    }

    #[test]
    fn path_matching() {
        assert!(same_path(
            "C:/Users/a/Projects/X/",
            "c:\\users\\a\\projects\\x"
        ));
        assert!(is_within("C:\\P\\X\\src", "c:/p/x"));
        assert!(is_within("C:\\P\\X", "C:\\P\\X\\"));
        assert!(!is_within("C:\\P\\Xy", "C:\\P\\X"));
    }
}
