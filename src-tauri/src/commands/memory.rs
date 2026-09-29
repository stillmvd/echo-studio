use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::commands::conversations::blocking;
use crate::conversations::scanner::list_projects;
use crate::memory::dupes::{self, DuplicatePair};
use crate::memory::scan;
use crate::memory::write::{self, locate, memory_dir};
use crate::memory::{
    projects_root, MemoryHit, MemoryListing, MemoryProject, MemoryRecord, RecordPatch,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFile {
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Archived {
    pub archived_path: String,
}

fn root() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| projects_root(&h))
        .ok_or_else(|| "cannot resolve home folder".to_string())
}

fn backups_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("memory-backups"))
        .map_err(|e| format!("cannot resolve app data folder: {e}"))
}

#[tauri::command]
pub async fn list_memory_projects() -> Result<Vec<MemoryProject>, String> {
    let root = root()?;
    blocking(move || {
        let cwds: HashMap<String, String> =
            list_projects().into_iter().map(|p| (p.id, p.cwd)).collect();
        scan::list_projects(&root, &cwds)
    })
    .await
}

#[tauri::command]
pub async fn list_memory(slug: String) -> Result<MemoryListing, String> {
    let root = root()?;
    blocking(move || memory_dir(&root, &slug).map(|dir| scan::list(&dir))).await?
}

#[tauri::command]
pub async fn read_memory_file(path: String) -> Result<MemoryFile, String> {
    let root = root()?;
    blocking(move || {
        let at = locate(&PathBuf::from(&path), &root)?;
        fs::read_to_string(&at.path)
            .map(|text| MemoryFile { text })
            .map_err(|e| format!("read {}: {e}", at.path.display()))
    })
    .await?
}

#[tauri::command]
pub async fn search_memory(query: String, slug: Option<String>) -> Result<Vec<MemoryHit>, String> {
    let root = root()?;
    blocking(move || scan::search(&root, &query, slug.as_deref())).await
}

#[tauri::command]
pub async fn save_memory_file(app: AppHandle, path: String, text: String) -> Result<(), String> {
    let root = root()?;
    let backups = backups_root(&app)?;
    blocking(move || write::save_text(&PathBuf::from(&path), &text, &root, &backups).map(|_| ()))
        .await?
}

#[tauri::command]
pub async fn archive_memory_record(app: AppHandle, path: String) -> Result<Archived, String> {
    let root = root()?;
    let backups = backups_root(&app)?;
    blocking(move || {
        write::archive(&PathBuf::from(&path), &root, &backups).map(|p| Archived {
            archived_path: p.to_string_lossy().into_owned(),
        })
    })
    .await?
}

#[tauri::command]
pub async fn restore_memory_record(
    app: AppHandle,
    archived_path: String,
) -> Result<MemoryRecord, String> {
    let root = root()?;
    let backups = backups_root(&app)?;
    blocking(move || write::restore(&PathBuf::from(&archived_path), &root, &backups)).await?
}

#[tauri::command]
pub async fn move_memory_record(
    app: AppHandle,
    path: String,
    target_slug: String,
) -> Result<MemoryRecord, String> {
    let root = root()?;
    let backups = backups_root(&app)?;
    blocking(move || write::move_to(&PathBuf::from(&path), &target_slug, &root, &backups)).await?
}

#[tauri::command]
pub async fn find_memory_duplicates(slug: Option<String>) -> Result<Vec<DuplicatePair>, String> {
    let root = root()?;
    blocking(move || {
        let mut pairs: Vec<DuplicatePair> = scan::memory_dirs(&root)
            .into_iter()
            .filter(|(s, _)| slug.as_ref().is_none_or(|want| want == s))
            .flat_map(|(s, dir)| dupes::find(&s, &scan::list(&dir).records))
            .collect();
        pairs.sort_by(|x, y| y.score.total_cmp(&x.score));
        pairs
    })
    .await
}

#[tauri::command]
pub async fn patch_memory_record(
    app: AppHandle,
    path: String,
    patch: RecordPatch,
) -> Result<MemoryRecord, String> {
    let root = root()?;
    let backups = backups_root(&app)?;
    blocking(move || write::patch(&PathBuf::from(&path), &patch, &root, &backups)).await?
}

#[tauri::command]
pub async fn merge_memory_records(
    app: AppHandle,
    canonical: String,
    absorbed: Vec<String>,
) -> Result<MemoryRecord, String> {
    let root = root()?;
    let backups = backups_root(&app)?;
    blocking(move || {
        let absorbed: Vec<PathBuf> = absorbed.iter().map(PathBuf::from).collect();
        write::merge(&PathBuf::from(&canonical), &absorbed, &root, &backups)
    })
    .await?
}
