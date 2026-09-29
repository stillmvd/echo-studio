use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate {
    update: Mutex<Option<Update>>,
    bytes: Mutex<Option<Vec<u8>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

fn pending(app: &AppHandle) -> tauri::State<'_, PendingUpdate> {
    app.state::<PendingUpdate>()
}

fn checked(app: &AppHandle) -> Result<Update, String> {
    pending(app)
        .update
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "check for updates first".to_string())
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        body: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    });
    let state = pending(&app);
    *state.update.lock().map_err(|e| e.to_string())? = update;
    *state.bytes.lock().map_err(|e| e.to_string())? = None;
    Ok(info)
}

#[tauri::command]
pub async fn update_download(app: AppHandle) -> Result<u64, String> {
    let update = checked(&app)?;
    let progress_app = app.clone();
    let mut downloaded: u64 = 0;
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress_app.emit("update-progress", UpdateProgress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    let size = bytes.len() as u64;
    *pending(&app).bytes.lock().map_err(|e| e.to_string())? = Some(bytes);
    Ok(size)
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let update = checked(&app)?;
    let bytes = pending(&app)
        .bytes
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or_else(|| "update is not downloaded yet".to_string())?;
    update.install(bytes).map_err(|e| e.to_string())
}

fn is_leftover(name: &str, app_name: &str) -> bool {
    name.strip_prefix(app_name)
        .and_then(|rest| rest.strip_prefix('-'))
        .is_some_and(|rest| rest.contains("-updater-"))
}

fn remove_leftovers(temp: &Path, app_name: &str) -> usize {
    let Ok(entries) = std::fs::read_dir(temp) else {
        return 0;
    };
    let mut left = 0;
    for entry in entries.flatten() {
        let name = entry.file_name();
        if !is_leftover(&name.to_string_lossy(), app_name) {
            continue;
        }
        if std::fs::remove_dir_all(entry.path()).is_err() {
            left += 1;
        }
    }
    left
}

pub fn cleanup_installers(app: &AppHandle) {
    let app_name = app.package_info().name.clone();
    std::thread::spawn(move || {
        let temp = std::env::temp_dir();
        for _ in 0..6 {
            if remove_leftovers(&temp, &app_name) == 0 {
                return;
            }
            std::thread::sleep(Duration::from_secs(10));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_only_own_updater_dirs() {
        let temp = tempfile::tempdir().unwrap();
        let own = temp.path().join("Echo Studio-0.5.0-updater-Ab12Cd");
        std::fs::create_dir(&own).unwrap();
        std::fs::write(own.join("Echo Studio-0.5.0-installer.exe"), b"x").unwrap();
        let other = temp.path().join("Booked-1.0.0-updater-Xy");
        std::fs::create_dir(&other).unwrap();
        let plain = temp.path().join("Echo Studio-cache");
        std::fs::create_dir(&plain).unwrap();

        assert_eq!(remove_leftovers(temp.path(), "Echo Studio"), 0);
        assert!(!own.exists());
        assert!(other.exists());
        assert!(plain.exists());
    }
}
