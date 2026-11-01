use std::path::PathBuf;

pub fn projects_root() -> Option<PathBuf> {
    crate::agent::claude().map(|p| p.sessions)
}

pub fn decode_cwd(encoded: &str) -> String {
    if let Some((drive, rest)) = encoded.split_once("--") {
        let suffix = rest.replace('-', "\\");
        format!("{drive}:\\{suffix}")
    } else {
        encoded.replace('-', "\\")
    }
}

pub fn display_name(cwd: &str) -> String {
    cwd.rsplit(['\\', '/'])
        .find(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| cwd.to_string())
}
