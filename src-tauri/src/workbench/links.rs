use std::path::{Path, PathBuf};

const DEFAULT_APP: &[&str] = &[
    "html", "htm", "pdf", "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif", "svg",
];

#[derive(Debug, PartialEq)]
pub enum Opener {
    Explorer(PathBuf),
    Editor(String),
}

fn plain(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    PathBuf::from(s.strip_prefix(r"\\?\").unwrap_or(&s))
}

pub fn resolve(base: Option<&Path>, raw: &str) -> Option<PathBuf> {
    let raw = Path::new(raw);
    let path = match base {
        _ if raw.is_absolute() => raw.to_path_buf(),
        Some(base) => base.join(raw),
        None => return None,
    };
    path.canonicalize().ok().map(|p| plain(&p))
}

pub fn opener(path: &Path, line: Option<u32>, column: Option<u32>) -> Opener {
    let by_default = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| DEFAULT_APP.contains(&e.to_ascii_lowercase().as_str()));
    if path.is_dir() || by_default {
        return Opener::Explorer(path.to_path_buf());
    }
    let mut target = path.to_string_lossy().into_owned();
    if let Some(line) = line {
        target.push_str(&format!(":{line}"));
        if let Some(column) = column {
            target.push_str(&format!(":{column}"));
        }
    }
    Opener::Editor(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_existing_paths_anywhere() {
        let root = tempfile::tempdir().unwrap();
        let base = root.path().join("app");
        std::fs::create_dir_all(base.join("docs")).unwrap();
        std::fs::write(base.join("docs/stand.html"), "").unwrap();
        std::fs::write(root.path().join("outside.txt"), "").unwrap();

        let found = resolve(Some(&base), "docs/stand.html").unwrap();
        assert!(found.ends_with("docs\\stand.html") || found.ends_with("docs/stand.html"));
        assert!(!found.to_string_lossy().starts_with(r"\\?\"));
        assert!(resolve(Some(&base), r"docs\stand.html").is_some());
        assert!(resolve(Some(&base), "../outside.txt").is_some());
        let outside = root.path().join("outside.txt");
        assert!(resolve(None, &outside.to_string_lossy()).is_some());
        assert!(resolve(None, "docs/stand.html").is_none());
        assert!(resolve(Some(&base), "docs/missing.html").is_none());
    }

    #[test]
    fn picks_opener_by_kind() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().to_path_buf();
        assert_eq!(opener(&dir, None, None), Opener::Explorer(dir.clone()));
        let html = dir.join("Stand.HTML");
        assert_eq!(opener(&html, Some(3), None), Opener::Explorer(html.clone()));
        let ts = dir.join("app.ts");
        let shown = ts.to_string_lossy();
        assert_eq!(
            opener(&ts, Some(42), Some(7)),
            Opener::Editor(format!("{shown}:42:7"))
        );
        assert_eq!(
            opener(&ts, None, Some(7)),
            Opener::Editor(shown.into_owned())
        );
    }
}
