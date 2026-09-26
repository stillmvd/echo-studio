use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::commands::conversations::blocking;
use crate::conversations::scanner::list_projects;
use crate::tooling::effective::{list_scopes, scan_global, scan_project};
use crate::tooling::paths::{
    claude_dir, claude_json, ensure_allowed, installed_plugins, same_project,
};
use crate::tooling::plugins::read_installed;
use crate::tooling::{ScanResult, ScopeKind, ScopeRef};

const READ_LIMIT: usize = 512 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeArg {
    pub kind: ScopeKind,
    pub path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolFile {
    pub text: String,
    pub truncated_at: Option<usize>,
}

fn home() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "cannot resolve home folder".to_string())
}

fn known_scopes(home: &Path) -> Vec<ScopeRef> {
    let cwds: Vec<String> = list_projects().into_iter().map(|p| p.cwd).collect();
    list_scopes(home, &cwds)
}

fn allowed_roots(home: &Path) -> Vec<PathBuf> {
    let mut roots = vec![claude_dir(home), claude_json(home)];
    roots.extend(
        known_scopes(home)
            .into_iter()
            .filter(|s| s.available)
            .filter_map(|s| s.path.map(PathBuf::from)),
    );
    roots.extend(
        read_installed(&installed_plugins(home))
            .0
            .into_iter()
            .map(|p| p.install_path),
    );
    roots
}

fn read_limited(path: &Path) -> Result<ToolFile, String> {
    let bytes = fs::read(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    if bytes.len() <= READ_LIMIT {
        return Ok(ToolFile {
            text: String::from_utf8_lossy(&bytes).into_owned(),
            truncated_at: None,
        });
    }
    let mut cut = READ_LIMIT;
    while cut > 0 && (bytes[cut] & 0b1100_0000) == 0b1000_0000 {
        cut -= 1;
    }
    Ok(ToolFile {
        text: String::from_utf8_lossy(&bytes[..cut]).into_owned(),
        truncated_at: Some(cut),
    })
}

#[tauri::command]
pub async fn list_tool_scopes() -> Result<Vec<ScopeRef>, String> {
    let home = home()?;
    blocking(move || known_scopes(&home)).await
}

#[tauri::command]
pub async fn scan_tool_scope(scope: ScopeArg) -> Result<ScanResult, String> {
    let home = home()?;
    blocking(move || match (scope.kind, scope.path) {
        (ScopeKind::Global, _) => Ok(scan_global(&home)),
        (ScopeKind::Project, Some(path)) => {
            let known = known_scopes(&home)
                .iter()
                .filter_map(|s| s.path.as_deref())
                .any(|p| same_project(p, &path));
            if known {
                Ok(scan_project(&home, &path))
            } else {
                Err(format!("unknown project: {path}"))
            }
        }
        (ScopeKind::Project, None) => Err("project path is required".into()),
    })
    .await?
}

#[tauri::command]
pub async fn read_tool_file(path: String) -> Result<ToolFile, String> {
    let home = home()?;
    blocking(move || {
        let target = PathBuf::from(&path);
        let ext = target.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !ext.eq_ignore_ascii_case("md") && !ext.eq_ignore_ascii_case("json") {
            return Err(format!("refusing: {path} is not .md or .json"));
        }
        let canonical = ensure_allowed(&target, &allowed_roots(&home))?;
        read_limited(&canonical)
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncates_on_char_boundary() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("big.md");
        let text = "я".repeat(READ_LIMIT);
        fs::write(&file, &text).unwrap();
        let out = read_limited(&file).unwrap();
        assert_eq!(out.truncated_at, Some(READ_LIMIT));
        assert!(out.text.chars().all(|c| c == 'я'));

        fs::write(&file, "small").unwrap();
        assert!(read_limited(&file).unwrap().truncated_at.is_none());
    }
}
