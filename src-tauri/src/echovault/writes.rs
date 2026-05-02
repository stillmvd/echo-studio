use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::backup::{create_backup, rotate_backups};
use super::error::Result;
use super::repo::EchoVaultRepo;

const BACKUP_KEEP: usize = 20;
const BULK_LIMIT: usize = 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkResult {
    pub succeeded: Vec<String>,
    pub failed: Vec<BulkFailure>,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkFailure {
    pub id: String,
    pub error: String,
}

impl EchoVaultRepo {
    pub fn archive(&self, id: &str, reason: &str) -> Result<bool> {
        let backup = create_backup(self.home())?;
        rotate_backups(self.home(), BACKUP_KEEP)?;
        let mut conn = self.conn_lock();
        let tx = conn.transaction()?;
        let updated = archive_in_tx(&tx, id, reason)?;
        tx.commit()?;
        let _ = backup;
        Ok(updated)
    }

    pub fn restore(&self, id: &str) -> Result<bool> {
        let _backup = create_backup(self.home())?;
        rotate_backups(self.home(), BACKUP_KEEP)?;
        let mut conn = self.conn_lock();
        let tx = conn.transaction()?;
        let updated = restore_in_tx(&tx, id)?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn hard_delete(&self, id: &str) -> Result<bool> {
        let _backup = create_backup(self.home())?;
        rotate_backups(self.home(), BACKUP_KEEP)?;
        let mut conn = self.conn_lock();
        let tx = conn.transaction()?;
        let deleted = delete_in_tx(&tx, id)?;
        tx.commit()?;
        Ok(deleted)
    }

    pub fn bulk_archive(&self, ids: &[String], reason: &str) -> Result<BulkResult> {
        let backup = create_backup(self.home())?;
        rotate_backups(self.home(), BACKUP_KEEP)?;
        let mut conn = self.conn_lock();
        let tx = conn.transaction()?;
        let mut succeeded = Vec::new();
        let mut failed = Vec::new();
        for id in ids.iter().take(BULK_LIMIT) {
            match archive_in_tx(&tx, id, reason) {
                Ok(true) => succeeded.push(id.clone()),
                Ok(false) => failed.push(BulkFailure {
                    id: id.clone(),
                    error: "not found".into(),
                }),
                Err(e) => failed.push(BulkFailure {
                    id: id.clone(),
                    error: e.to_string(),
                }),
            }
        }
        tx.commit()?;
        Ok(BulkResult {
            succeeded,
            failed,
            backup_path: Some(backup.to_string_lossy().to_string()),
        })
    }

    pub fn bulk_restore(&self, ids: &[String]) -> Result<BulkResult> {
        let backup = create_backup(self.home())?;
        rotate_backups(self.home(), BACKUP_KEEP)?;
        let mut conn = self.conn_lock();
        let tx = conn.transaction()?;
        let mut succeeded = Vec::new();
        let mut failed = Vec::new();
        for id in ids.iter().take(BULK_LIMIT) {
            match restore_in_tx(&tx, id) {
                Ok(true) => succeeded.push(id.clone()),
                Ok(false) => failed.push(BulkFailure {
                    id: id.clone(),
                    error: "not found".into(),
                }),
                Err(e) => failed.push(BulkFailure {
                    id: id.clone(),
                    error: e.to_string(),
                }),
            }
        }
        tx.commit()?;
        Ok(BulkResult {
            succeeded,
            failed,
            backup_path: Some(backup.to_string_lossy().to_string()),
        })
    }

    pub fn bulk_delete(&self, ids: &[String]) -> Result<BulkResult> {
        let backup = create_backup(self.home())?;
        rotate_backups(self.home(), BACKUP_KEEP)?;
        let mut conn = self.conn_lock();
        let tx = conn.transaction()?;
        let mut succeeded = Vec::new();
        let mut failed = Vec::new();
        for id in ids.iter().take(BULK_LIMIT) {
            match delete_in_tx(&tx, id) {
                Ok(true) => succeeded.push(id.clone()),
                Ok(false) => failed.push(BulkFailure {
                    id: id.clone(),
                    error: "not found".into(),
                }),
                Err(e) => failed.push(BulkFailure {
                    id: id.clone(),
                    error: e.to_string(),
                }),
            }
        }
        tx.commit()?;
        Ok(BulkResult {
            succeeded,
            failed,
            backup_path: Some(backup.to_string_lossy().to_string()),
        })
    }
}

fn archive_in_tx(tx: &Connection, id: &str, reason: &str) -> Result<bool> {
    let now = Utc::now().to_rfc3339();
    let n = tx.execute(
        "UPDATE memories
         SET status = 'archived', archived_at = ?1, archive_reason = ?2, updated_at = ?3
         WHERE id = ?4",
        params![now, reason, now, id],
    )?;
    Ok(n > 0)
}

fn restore_in_tx(tx: &Connection, id: &str) -> Result<bool> {
    let now = Utc::now().to_rfc3339();
    let n = tx.execute(
        "UPDATE memories
         SET status = 'active', archived_at = NULL, archive_reason = NULL,
             superseded_by = NULL, updated_at = ?1
         WHERE id = ?2",
        params![now, id],
    )?;
    Ok(n > 0)
}

struct FtsRow {
    rowid: i64,
    title: String,
    what: String,
    why: Option<String>,
    impact: Option<String>,
    tags: Option<String>,
    category: Option<String>,
    project: String,
    source: Option<String>,
}

fn delete_in_tx(tx: &Connection, id: &str) -> Result<bool> {
    let row = tx
        .query_row(
            "SELECT rowid, title, what, why, impact, tags, category, project, source
             FROM memories WHERE id = ?1",
            params![id],
            |r| {
                Ok(FtsRow {
                    rowid: r.get(0)?,
                    title: r.get(1)?,
                    what: r.get(2)?,
                    why: r.get(3)?,
                    impact: r.get(4)?,
                    tags: r.get(5)?,
                    category: r.get(6)?,
                    project: r.get(7)?,
                    source: r.get(8)?,
                })
            },
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })?;

    let Some(r) = row else {
        return Ok(false);
    };

    tx.execute(
        "INSERT INTO memories_fts(memories_fts, rowid, title, what, why, impact, tags, category, project, source)
         VALUES ('delete', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![r.rowid, r.title, r.what, r.why, r.impact, r.tags, r.category, r.project, r.source],
    )?;
    tx.execute(
        "DELETE FROM memory_details WHERE memory_id = ?1",
        params![id],
    )?;
    tx.execute(
        "DELETE FROM memories_vec WHERE rowid = ?1",
        params![r.rowid],
    )?;
    tx.execute("DELETE FROM memories WHERE id = ?1", params![id])?;
    Ok(true)
}
