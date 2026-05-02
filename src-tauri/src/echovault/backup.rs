use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use super::error::Result;
use super::paths::{backups_dir, index_db_path};

const BACKUP_PREFIX: &str = "index.";
const BACKUP_SUFFIX: &str = ".db";
const TIMESTAMP_FORMAT: &str = "%Y%m%d-%H%M%S";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub created_at: String,
    pub size_bytes: u64,
}

pub fn create_backup(home: &Path) -> Result<PathBuf> {
    let dir = backups_dir(home);
    fs::create_dir_all(&dir)?;
    let stamp = Utc::now().format(TIMESTAMP_FORMAT).to_string();
    let target = dir.join(format!("{BACKUP_PREFIX}{stamp}{BACKUP_SUFFIX}"));
    let source = index_db_path(home);
    fs::copy(&source, &target)?;
    Ok(target)
}

pub fn list_backups(home: &Path) -> Result<Vec<BackupInfo>> {
    let dir = backups_dir(home);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut items: Vec<BackupInfo> = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.starts_with(BACKUP_PREFIX) || !name.ends_with(BACKUP_SUFFIX) {
            continue;
        }
        let metadata = entry.metadata()?;
        let stamp = name
            .strip_prefix(BACKUP_PREFIX)
            .and_then(|s| s.strip_suffix(BACKUP_SUFFIX))
            .unwrap_or("");
        items.push(BackupInfo {
            path: path.to_string_lossy().to_string(),
            created_at: stamp.to_string(),
            size_bytes: metadata.len(),
        });
    }
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(items)
}

pub fn rotate_backups(home: &Path, keep: usize) -> Result<usize> {
    let backups = list_backups(home)?;
    let mut deleted = 0usize;
    for b in backups.iter().skip(keep) {
        if fs::remove_file(&b.path).is_ok() {
            deleted += 1;
        }
    }
    Ok(deleted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    fn fake_home(tmp: &Path) -> PathBuf {
        let home = tmp.to_path_buf();
        fs::create_dir_all(home.join(".backups")).unwrap();
        File::create(home.join("index.db")).unwrap();
        home
    }

    #[test]
    fn rotation_keeps_n_newest() {
        let tmp = std::env::temp_dir().join(format!(
            "echo-studio-backup-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let home = fake_home(&tmp);

        for stamp in [
            "20250101-100000",
            "20250101-110000",
            "20250101-120000",
            "20250101-130000",
        ] {
            let p = home.join(".backups").join(format!("index.{stamp}.db"));
            File::create(&p).unwrap();
        }

        assert_eq!(list_backups(&home).unwrap().len(), 4);
        let deleted = rotate_backups(&home, 2).unwrap();
        assert_eq!(deleted, 2);
        let after = list_backups(&home).unwrap();
        assert_eq!(after.len(), 2);
        assert_eq!(after[0].created_at, "20250101-130000");
        assert_eq!(after[1].created_at, "20250101-120000");

        fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn create_then_list_returns_one() {
        let tmp = std::env::temp_dir().join(format!(
            "echo-studio-backup-create-{}",
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let home = fake_home(&tmp);

        let path = create_backup(&home).unwrap();
        assert!(path.exists());

        let backups = list_backups(&home).unwrap();
        assert_eq!(backups.len(), 1);

        fs::remove_dir_all(&tmp).ok();
    }
}
