use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::conversations::blocking;
use crate::tooling::inventory::{self, Entry, Place, Usage};
use crate::tooling::paths::claude_dir;
use crate::tooling::write::{list_backups, set_enabled, ConfigBackup};
use crate::tooling::{actions, runs, updates, ToggleTarget};
use crate::workbench::{projects, projects_root};

fn home() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "Не найдена домашняя папка".to_string())
}

fn backups_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("config-backups"))
        .map_err(|e| format!("Нет доступа к папке данных приложения: {e}"))
}

fn places() -> Vec<Place> {
    projects_root()
        .map(|root| {
            projects::all_projects(&projects::scan(&root))
                .map(|p| Place {
                    name: p.name.clone(),
                    path: p.path.clone(),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn known(places: Vec<Place>) -> Vec<String> {
    places.into_iter().map(|p| p.path).collect()
}

#[tauri::command]
pub async fn set_tool_enabled(
    app: AppHandle,
    target: ToggleTarget,
    enabled: bool,
) -> Result<(), String> {
    let home = home()?;
    let backups = backups_root(&app)?;
    blocking(move || set_enabled(&home, &backups, &known(places()), &target, enabled)).await?
}

#[tauri::command]
pub async fn list_tools() -> Result<Vec<Entry>, String> {
    let home = home()?;
    blocking(move || inventory::list(&home, &places())).await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRuns {
    pub start: Option<i64>,
    pub usage: HashMap<String, Usage>,
}

#[tauri::command]
pub async fn read_tool_runs(app: AppHandle) -> Result<ToolRuns, String> {
    let home = home()?;
    let cache = app
        .path()
        .app_local_data_dir()
        .map(|d| d.join("tools-usage-cache.json"))
        .ok();
    blocking(move || {
        let places = places();
        let entries = inventory::list(&home, &places);
        let runs = runs::collect(&claude_dir(&home).join("projects"), cache.as_deref());
        ToolRuns {
            start: runs.start,
            usage: inventory::usage(&entries, &runs, &places),
        }
    })
    .await
}

fn find_entry(home: &Path, places: &[Place], id: &str) -> Result<Entry, String> {
    inventory::list(home, places)
        .into_iter()
        .find(|e| e.item.id == id)
        .ok_or_else(|| format!("Инструмент не найден: {id}"))
}

#[tauri::command]
pub async fn delete_tool(
    app: AppHandle,
    id: String,
    projects: Vec<String>,
) -> Result<actions::Done, String> {
    let home = home()?;
    let backups = backups_root(&app)?;
    blocking(move || {
        let places = places();
        let steps = actions::plan_delete(&find_entry(&home, &places, &id)?, &projects)?;
        actions::execute(&steps, &home, &backups, &known(places))
    })
    .await?
}

#[tauri::command]
pub async fn update_tool(app: AppHandle, id: String) -> Result<(), String> {
    let home = home()?;
    let backups = backups_root(&app)?;
    blocking(move || {
        let places = places();
        let step = actions::plan_update(&find_entry(&home, &places, &id)?, &home)?;
        actions::execute(&[step], &home, &backups, &known(places)).map(|_| ())
    })
    .await?
}

#[tauri::command]
pub async fn check_tool_updates(app: AppHandle) -> Result<updates::Check, String> {
    let home = home()?;
    blocking(move || {
        updates::check(&home, &inventory::list(&home, &places()), |done, total| {
            let _ = app.emit(
                "tooling://update-progress",
                serde_json::json!({ "done": done, "total": total }),
            );
        })
    })
    .await
}

#[tauri::command]
pub async fn list_config_backups(app: AppHandle) -> Result<Vec<ConfigBackup>, String> {
    let backups = backups_root(&app)?;
    blocking(move || list_backups(&backups)).await
}
