use std::path::{Path, PathBuf};

pub fn claude_dir(home: &Path) -> PathBuf {
    home.join(".claude")
}

pub fn claude_json(home: &Path) -> PathBuf {
    home.join(".claude.json")
}

pub fn installed_plugins(home: &Path) -> PathBuf {
    claude_dir(home)
        .join("plugins")
        .join("installed_plugins.json")
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

pub fn ensure_allowed(path: &Path, roots: &[PathBuf]) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("cannot resolve {}: {e}", path.display()))?;
    let allowed = roots
        .iter()
        .filter_map(|r| r.canonicalize().ok())
        .any(|r| canonical.starts_with(&r));
    if allowed {
        Ok(canonical)
    } else {
        Err(format!(
            "refusing: {} is outside allowed folders",
            path.display()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn normalizes_project_paths() {
        assert_eq!(normalize_project("c:/Users/x/Proj/"), "C:\\Users\\x\\Proj");
        assert_eq!(normalize_project("C:\\"), "C:\\");
        assert!(same_project("c:/Users/X/p", "C:\\users\\x\\P\\"));
        assert!(!same_project("C:/a/b", "C:/a/bc"));
    }

    #[test]
    fn allows_only_paths_inside_roots() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let inside = root.path().join("skills").join("a.md");
        fs::create_dir_all(inside.parent().unwrap()).unwrap();
        fs::write(&inside, "x").unwrap();
        let outside = other.path().join("b.md");
        fs::write(&outside, "x").unwrap();
        let roots = vec![root.path().to_path_buf()];

        assert!(ensure_allowed(&inside, &roots).is_ok());
        assert!(ensure_allowed(&outside, &roots).is_err());
        let escape = root
            .path()
            .join("skills")
            .join("..")
            .join("..")
            .join(other.path().file_name().unwrap())
            .join("b.md");
        assert!(ensure_allowed(&escape, &roots).is_err());
        assert!(ensure_allowed(&root.path().join("missing.md"), &roots).is_err());
    }
}
