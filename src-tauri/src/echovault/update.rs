use chrono::Utc;
use rusqlite::{params, Connection, ToSql};
use serde::Deserialize;

use super::backup::{create_backup, rotate_backups};
use super::error::Result;
use super::repo::EchoVaultRepo;

const BACKUP_KEEP: usize = 20;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MemoryPatch {
    pub title: Option<String>,
    pub what: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub why: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub impact: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub category: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub body: Option<Option<String>>,
}

fn double_option<'de, T, D>(de: D) -> std::result::Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Option::<T>::deserialize(de).map(Some)
}

impl EchoVaultRepo {
    pub fn update(&self, id: &str, patch: &MemoryPatch) -> Result<bool> {
        let _backup = create_backup(self.home())?;
        rotate_backups(self.home(), BACKUP_KEEP)?;
        let mut conn = self.conn_lock();
        let tx = conn.transaction()?;
        let updated = update_in_tx(&tx, id, patch)?;
        tx.commit()?;
        Ok(updated)
    }
}

fn update_in_tx(tx: &Connection, id: &str, patch: &MemoryPatch) -> Result<bool> {
    let now = Utc::now().to_rfc3339();
    let mut sets: Vec<String> = Vec::new();
    let mut binds: Vec<Box<dyn ToSql>> = Vec::new();

    if let Some(title) = patch.title.as_ref() {
        sets.push(format!("title = ?{}", binds.len() + 1));
        binds.push(Box::new(title.clone()));
    }
    if let Some(what) = patch.what.as_ref() {
        sets.push(format!("what = ?{}", binds.len() + 1));
        binds.push(Box::new(what.clone()));
    }
    if let Some(opt) = patch.why.as_ref() {
        sets.push(format!("why = ?{}", binds.len() + 1));
        binds.push(match opt {
            Some(v) => Box::new(v.clone()),
            None => Box::new(Option::<String>::None),
        });
    }
    if let Some(opt) = patch.impact.as_ref() {
        sets.push(format!("impact = ?{}", binds.len() + 1));
        binds.push(match opt {
            Some(v) => Box::new(v.clone()),
            None => Box::new(Option::<String>::None),
        });
    }
    if let Some(opt) = patch.category.as_ref() {
        sets.push(format!("category = ?{}", binds.len() + 1));
        binds.push(match opt {
            Some(v) => Box::new(v.clone()),
            None => Box::new(Option::<String>::None),
        });
    }
    if let Some(tags) = patch.tags.as_ref() {
        let json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
        sets.push(format!("tags = ?{}", binds.len() + 1));
        binds.push(Box::new(json));
    }

    sets.push(format!("updated_at = ?{}", binds.len() + 1));
    binds.push(Box::new(now.clone()));
    sets.push("updated_count = COALESCE(updated_count, 0) + 1".to_string());

    let head_changed = sets.len() > 2 || patch.title.is_some() || patch.what.is_some();
    let mut updated_rows: usize = 0;
    if head_changed {
        let sql = format!(
            "UPDATE memories SET {set_clause} WHERE id = ?{id_idx}",
            set_clause = sets.join(", "),
            id_idx = binds.len() + 1,
        );
        binds.push(Box::new(id.to_string()));
        let params: Vec<&dyn ToSql> = binds.iter().map(|b| b.as_ref()).collect();
        updated_rows = tx.execute(&sql, params.as_slice())?;
        if updated_rows == 0 {
            return Ok(false);
        }
    }

    if let Some(opt_body) = patch.body.as_ref() {
        match opt_body {
            Some(body) => {
                tx.execute(
                    "INSERT INTO memory_details(memory_id, body) VALUES (?1, ?2)
                     ON CONFLICT(memory_id) DO UPDATE SET body = excluded.body",
                    params![id, body],
                )?;
            }
            None => {
                tx.execute(
                    "DELETE FROM memory_details WHERE memory_id = ?1",
                    params![id],
                )?;
            }
        }
        if !head_changed {
            tx.execute(
                "UPDATE memories
                 SET updated_at = ?1, updated_count = COALESCE(updated_count, 0) + 1
                 WHERE id = ?2",
                params![now, id],
            )?;
            updated_rows = updated_rows.max(1);
        }
    }

    Ok(updated_rows > 0)
}
