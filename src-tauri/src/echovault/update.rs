use chrono::Utc;
use rusqlite::{params, Connection, ToSql};
use serde::Deserialize;

use super::backup::{create_backup, rotate_backups};
use super::error::Result;
use super::repo::EchoVaultRepo;
use super::writes::{fts_add, fts_remove, fts_synced_by_trigger, memory_rowid};

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

    let head_changed = sets.len() > 2;
    if !head_changed && patch.body.is_none() {
        return Ok(false);
    }
    let Some(rowid) = memory_rowid(tx, id)? else {
        return Ok(false);
    };
    let manual_fts = head_changed && !fts_synced_by_trigger(tx, "UPDATE")?;

    if head_changed {
        if manual_fts {
            fts_remove(tx, rowid)?;
        }
        let sql = format!(
            "UPDATE memories SET {set_clause} WHERE rowid = ?{rowid_idx}",
            set_clause = sets.join(", "),
            rowid_idx = binds.len() + 1,
        );
        binds.push(Box::new(rowid));
        let params: Vec<&dyn ToSql> = binds.iter().map(|b| b.as_ref()).collect();
        tx.execute(&sql, params.as_slice())?;
        if manual_fts {
            fts_add(tx, rowid)?;
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
                 WHERE rowid = ?2",
                params![now, rowid],
            )?;
        }
    }

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE memories (id TEXT UNIQUE, title TEXT, what TEXT, why TEXT, impact TEXT,
               tags TEXT, category TEXT, project TEXT, source TEXT, updated_at TEXT, updated_count INTEGER);
             CREATE TABLE memory_details (memory_id TEXT PRIMARY KEY, body TEXT);
             CREATE VIRTUAL TABLE memories_fts USING fts5(title, what, why, impact, tags, category,
               project, source, content='memories', content_rowid='rowid');
             INSERT INTO memories(id, title, what, project) VALUES ('m1', 'old heading', 'x', 'p');
             INSERT INTO memories_fts(rowid, title, what, why, impact, tags, category, project, source)
               SELECT rowid, title, what, why, impact, tags, category, project, source FROM memories;",
        )
        .unwrap();
        c
    }

    fn hits(c: &Connection, q: &str) -> i64 {
        c.query_row(
            "SELECT count(*) FROM memories_fts WHERE memories_fts MATCH ?1",
            params![q],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn title_update_reindexes_fts() {
        let c = db();
        let patch = MemoryPatch {
            title: Some("fresh heading".into()),
            ..Default::default()
        };
        assert!(update_in_tx(&c, "m1", &patch).unwrap());
        assert_eq!(hits(&c, "fresh"), 1);
        assert_eq!(hits(&c, "old"), 0);
    }

    #[test]
    fn body_patch_on_missing_id_is_noop() {
        let c = db();
        let patch = MemoryPatch {
            body: Some(Some("text".into())),
            ..Default::default()
        };
        assert!(!update_in_tx(&c, "missing", &patch).unwrap());
        let n: i64 = c
            .query_row("SELECT count(*) FROM memory_details", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }
}
