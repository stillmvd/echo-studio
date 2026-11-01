use std::path::{Path, PathBuf};

use crate::agent::{AgentKind, Profile};

pub fn claude_dir(home: &Path) -> PathBuf {
    Profile::claude(home).home
}

pub fn claude_json(home: &Path) -> PathBuf {
    Profile::claude(home).mcp
}

pub fn user_settings(home: &Path) -> PathBuf {
    Profile::claude(home).settings
}

pub fn installed_plugins(home: &Path) -> PathBuf {
    Profile::claude(home).plugins
}

pub fn project_dir(project: &Path) -> PathBuf {
    project.join(AgentKind::Claude.project_dir())
}

pub fn normalize_project(path: &str) -> String {
    let mut s = path.trim().replace('/', "\\");
    while s.len() > 3 && s.ends_with('\\') {
        s.pop();
    }
    let mut chars = s.chars();
    match (chars.next(), chars.next()) {
        (Some(d), Some(':')) => format!("{}{}", d.to_ascii_uppercase(), &s[1..]),
        _ => s,
    }
}

pub fn same_project(a: &str, b: &str) -> bool {
    normalize_project(a).eq_ignore_ascii_case(&normalize_project(b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_project_paths() {
        assert_eq!(normalize_project("c:/Users/x/Proj/"), "C:\\Users\\x\\Proj");
        assert_eq!(normalize_project("C:\\"), "C:\\");
        assert!(same_project("c:/Users/X/p", "C:\\users\\x\\P\\"));
        assert!(!same_project("C:/a/b", "C:/a/bc"));
    }
}
