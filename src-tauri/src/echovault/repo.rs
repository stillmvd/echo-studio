use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, Once};
use std::time::Duration;

use rusqlite::{params, params_from_iter, Connection, OpenFlags, Row};
use serde_json::Value as JsonValue;

use super::error::{EchoVaultError, Result};
use super::models::{
    CategoryCount, MemoriesFilter, MemoriesPage, Memory, MemoryWithBody, ProjectCount, SearchMode,
    TagCount,
};
use super::ollama::{embedding_to_blob, OllamaClient};
use super::paths::{index_db_path, resolve_memory_home};
use super::search::{build_fts_query, merge_rrf};

static VEC_INIT: Once = Once::new();

fn register_vec_extension() {
    VEC_INIT.call_once(|| unsafe {
        type VecInit = unsafe extern "C" fn(
            *mut rusqlite::ffi::sqlite3,
            *mut *mut i8,
            *const rusqlite::ffi::sqlite3_api_routines,
        ) -> i32;
        let init: VecInit =
            std::mem::transmute::<*const (), VecInit>(sqlite_vec::sqlite3_vec_init as *const ());
        rusqlite::ffi::sqlite3_auto_extension(Some(init));
    });
}

pub struct EchoVaultRepo {
    conn: Mutex<Connection>,
    memory_home: PathBuf,
    home_source: &'static str,
    ollama: OllamaClient,
}

impl EchoVaultRepo {
    pub fn open() -> Result<Self> {
        register_vec_extension();
        let (home, source) = resolve_memory_home()?;
        let db_path = index_db_path(&home);
        if !db_path.exists() {
            return Err(EchoVaultError::NotInitialized(
                db_path.to_string_lossy().to_string(),
            ));
        }
        let conn = Connection::open_with_flags(
            &db_path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        conn.busy_timeout(Duration::from_millis(2000))?;
        Ok(Self {
            conn: Mutex::new(conn),
            memory_home: home,
            home_source: source,
            ollama: OllamaClient::default(),
        })
    }

    pub fn home(&self) -> &PathBuf {
        &self.memory_home
    }

    pub fn home_source(&self) -> &'static str {
        self.home_source
    }

    pub(crate) fn conn_lock(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().expect("poisoned conn mutex")
    }

    pub async fn search(&self, filter: &MemoriesFilter) -> Result<MemoriesPage> {
        let has_query = filter
            .query
            .as_ref()
            .map(|q| !q.trim().is_empty())
            .unwrap_or(false);

        let requested_mode = filter.mode.unwrap_or_default();

        if !has_query {
            return self.list_filtered(filter, None, None);
        }

        let query = filter.query.as_ref().unwrap().trim().to_string();
        let mut warning: Option<String> = None;

        let chosen_rowids: Option<Vec<i64>> = match requested_mode {
            SearchMode::Lexical => Some(self.fts5_rowids(&query)?),
            SearchMode::Semantic => match self.semantic_rowids(&query).await {
                Ok(ids) => Some(ids),
                Err(EchoVaultError::OllamaUnreachable(msg)) => {
                    warning = Some(format!(
                        "Semantic search unavailable: {msg}. Showing lexical results."
                    ));
                    Some(self.fts5_rowids(&query)?)
                }
                Err(other) => return Err(other),
            },
            SearchMode::Hybrid => {
                let lex = self.fts5_rowids(&query)?;
                match self.semantic_rowids(&query).await {
                    Ok(sem) => Some(rrf_pick(&lex, &sem)),
                    Err(EchoVaultError::OllamaUnreachable(msg)) => {
                        warning = Some(format!(
                            "Hybrid: semantic unavailable ({msg}). Lexical only."
                        ));
                        Some(lex)
                    }
                    Err(other) => return Err(other),
                }
            }
        };

        let mode_used = match (requested_mode, &warning) {
            (SearchMode::Semantic | SearchMode::Hybrid, Some(_)) => SearchMode::Lexical,
            (m, _) => m,
        };

        self.list_filtered(filter, chosen_rowids, Some((mode_used, warning)))
    }

    pub fn list(&self, filter: &MemoriesFilter) -> Result<MemoriesPage> {
        self.list_filtered(filter, None, None)
    }

    pub fn get(&self, id: &str) -> Result<Option<MemoryWithBody>> {
        let conn = self.conn.lock().expect("poisoned conn mutex");

        let memory_opt = conn
            .query_row(
                "SELECT id, title, what, why, impact, tags, category, project, source,
                        related_files, file_path, section_anchor, created_at, updated_at,
                        COALESCE(status, 'active'), archived_at, archive_reason, superseded_by,
                        COALESCE(updated_count, 0)
                 FROM memories WHERE id = ?1",
                params![id],
                map_row,
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(other),
            })?;

        let Some(memory) = memory_opt else {
            return Ok(None);
        };

        let body: Option<String> = conn
            .query_row(
                "SELECT body FROM memory_details WHERE memory_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(other),
            })?;

        let size_bytes = body.as_ref().map(|b| b.len() as i64).unwrap_or(0);
        Ok(Some(MemoryWithBody {
            memory,
            body,
            size_bytes,
        }))
    }

    fn fts5_rowids(&self, query: &str) -> Result<Vec<i64>> {
        let Some(fts_query) = build_fts_query(query) else {
            return Ok(Vec::new());
        };
        let conn = self.conn.lock().expect("poisoned conn mutex");
        let mut stmt = conn.prepare(
            "SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?1 ORDER BY rank LIMIT 500",
        )?;
        let rows = stmt
            .query_map(params![fts_query], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    async fn semantic_rowids(&self, query: &str) -> Result<Vec<i64>> {
        let embedding = self.ollama.embed(query).await?;
        let blob = embedding_to_blob(&embedding);
        let conn = self.conn.lock().expect("poisoned conn mutex");
        let mut stmt = conn.prepare(
            "SELECT rowid FROM memories_vec
             WHERE embedding MATCH ?1 AND k = 200
             ORDER BY distance",
        )?;
        let rows = stmt
            .query_map(params![blob], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    fn list_filtered(
        &self,
        filter: &MemoriesFilter,
        ranked_rowids: Option<Vec<i64>>,
        mode_meta: Option<(SearchMode, Option<String>)>,
    ) -> Result<MemoriesPage> {
        let conn = self.conn.lock().expect("poisoned conn mutex");
        let limit = filter.limit.unwrap_or(200).clamp(1, 1000);
        let offset = filter.offset.unwrap_or(0).max(0);

        let (where_sql, where_params) = build_where(filter, ranked_rowids.as_deref());

        let count_sql = format!("SELECT COUNT(*) FROM memories WHERE {where_sql}");
        let total: i64 = conn.query_row(
            &count_sql,
            params_from_iter(where_params.iter().map(|p| p.as_str())),
            |row| row.get(0),
        )?;

        let order_clause = match ranked_rowids.as_deref() {
            Some(rowids) if !rowids.is_empty() => format!(
                "CASE rowid {} ELSE 999999 END ASC",
                rowids
                    .iter()
                    .enumerate()
                    .take(500)
                    .map(|(i, id)| format!("WHEN {id} THEN {i}"))
                    .collect::<Vec<_>>()
                    .join(" ")
            ),
            _ => filter.sort_by.unwrap_or_default().as_sql().to_string(),
        };

        let list_sql = format!(
            "SELECT id, title, what, why, impact, tags, category, project, source,
                    related_files, file_path, section_anchor, created_at, updated_at,
                    COALESCE(status, 'active'), archived_at, archive_reason, superseded_by,
                    COALESCE(updated_count, 0)
             FROM memories
             WHERE {where_sql}
             ORDER BY {order_clause}
             LIMIT ?{lim_idx} OFFSET ?{off_idx}",
            lim_idx = where_params.len() + 1,
            off_idx = where_params.len() + 2,
        );

        let mut stmt = conn.prepare(&list_sql)?;
        let mut bound: Vec<String> = where_params.clone();
        bound.push(limit.to_string());
        bound.push(offset.to_string());

        let rows = stmt
            .query_map(params_from_iter(bound.iter().map(|p| p.as_str())), map_row)?
            .collect::<rusqlite::Result<Vec<Memory>>>()?;

        drop(stmt);
        let projects = collect_project_counts(&conn)?;
        let categories = collect_category_counts(&conn)?;
        let tags = collect_tag_counts(&conn, filter)?;

        let (mode_used, semantic_warning) =
            mode_meta.map(|(m, w)| (Some(m), w)).unwrap_or((None, None));

        Ok(MemoriesPage {
            total,
            items: rows,
            projects,
            categories,
            tags,
            memory_home: self.memory_home.to_string_lossy().to_string(),
            home_source: self.home_source.to_string(),
            mode_used,
            semantic_warning,
        })
    }
}

fn rrf_pick(lex: &[i64], sem: &[i64]) -> Vec<i64> {
    let lex_pairs: Vec<(i64, f64)> = lex.iter().map(|id| (*id, 0.0)).collect();
    let sem_pairs: Vec<(i64, f64)> = sem.iter().map(|id| (*id, 0.0)).collect();
    merge_rrf(lex_pairs, sem_pairs, 60)
        .into_iter()
        .map(|(id, _)| id)
        .collect()
}

fn build_where(filter: &MemoriesFilter, ranked_rowids: Option<&[i64]>) -> (String, Vec<String>) {
    let mut clauses = Vec::<String>::new();
    let mut params = Vec::<String>::new();

    let status = filter.status.as_deref().unwrap_or("active");
    match status {
        "all" => {}
        s => {
            clauses.push(format!(
                "COALESCE(status, 'active') = ?{}",
                params.len() + 1
            ));
            params.push(s.to_string());
        }
    }

    if let Some(p) = filter.project.as_ref().filter(|s| !s.is_empty()) {
        clauses.push(format!("project = ?{}", params.len() + 1));
        params.push(p.clone());
    }
    if let Some(c) = filter.category.as_ref().filter(|s| !s.is_empty()) {
        clauses.push(format!("category = ?{}", params.len() + 1));
        params.push(c.clone());
    }
    if let Some(d) = filter.date_from.as_ref().filter(|s| !s.is_empty()) {
        clauses.push(format!("date(updated_at) >= date(?{})", params.len() + 1));
        params.push(d.clone());
    }
    if let Some(d) = filter.date_to.as_ref().filter(|s| !s.is_empty()) {
        clauses.push(format!("date(updated_at) <= date(?{})", params.len() + 1));
        params.push(d.clone());
    }
    for t in &filter.tags {
        if t.is_empty() {
            continue;
        }
        clauses.push(format!(
            "EXISTS (SELECT 1 FROM json_each(memories.tags) WHERE json_each.value = ?{})",
            params.len() + 1
        ));
        params.push(t.clone());
    }

    if let Some(rowids) = ranked_rowids {
        if rowids.is_empty() {
            clauses.push("0".to_string());
        } else {
            let inlined = rowids
                .iter()
                .take(500)
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(",");
            clauses.push(format!("rowid IN ({inlined})"));
        }
    }

    if clauses.is_empty() {
        ("1=1".to_string(), params)
    } else {
        (clauses.join(" AND "), params)
    }
}

fn map_row(row: &Row<'_>) -> rusqlite::Result<Memory> {
    Ok(Memory {
        id: row.get(0)?,
        title: row.get(1)?,
        what: row.get(2)?,
        why: row.get(3)?,
        impact: row.get(4)?,
        tags: parse_json_array(row.get::<_, Option<String>>(5)?),
        category: row.get(6)?,
        project: row.get(7)?,
        source: row.get(8)?,
        related_files: parse_json_array(row.get::<_, Option<String>>(9)?),
        file_path: row.get(10)?,
        section_anchor: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        status: row.get(14)?,
        archived_at: row.get(15)?,
        archive_reason: row.get(16)?,
        superseded_by: row.get(17)?,
        updated_count: row.get(18)?,
    })
}

fn parse_json_array(raw: Option<String>) -> Vec<String> {
    let Some(raw) = raw else { return Vec::new() };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    match serde_json::from_str::<JsonValue>(trimmed) {
        Ok(JsonValue::Array(items)) => items
            .into_iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect(),
        _ => trimmed
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
    }
}

fn collect_project_counts(conn: &Connection) -> Result<Vec<ProjectCount>> {
    let mut stmt = conn.prepare(
        "SELECT project, COUNT(*) as cnt
         FROM memories
         WHERE COALESCE(status,'active') = 'active'
         GROUP BY project
         ORDER BY cnt DESC, project ASC",
    )?;
    let items = stmt
        .query_map([], |row| {
            Ok(ProjectCount {
                project: row.get(0)?,
                count: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

fn collect_category_counts(conn: &Connection) -> Result<Vec<CategoryCount>> {
    let mut stmt = conn.prepare(
        "SELECT category, COUNT(*) as cnt
         FROM memories
         WHERE COALESCE(status,'active') = 'active'
         GROUP BY category
         ORDER BY cnt DESC",
    )?;
    let items = stmt
        .query_map([], |row| {
            Ok(CategoryCount {
                category: row.get(0)?,
                count: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}

fn collect_tag_counts(conn: &Connection, filter: &MemoriesFilter) -> Result<Vec<TagCount>> {
    let mut where_clauses = vec!["COALESCE(status,'active') = 'active'".to_string()];
    let mut bind: Vec<String> = Vec::new();
    if let Some(p) = filter.project.as_ref().filter(|s| !s.is_empty()) {
        where_clauses.push(format!("project = ?{}", bind.len() + 1));
        bind.push(p.clone());
    }
    if let Some(c) = filter.category.as_ref().filter(|s| !s.is_empty()) {
        where_clauses.push(format!("category = ?{}", bind.len() + 1));
        bind.push(c.clone());
    }

    let sql = format!(
        "SELECT json_each.value AS tag, COUNT(*) AS cnt
         FROM memories, json_each(memories.tags)
         WHERE {where_clause}
         GROUP BY tag
         ORDER BY cnt DESC, tag ASC
         LIMIT 60",
        where_clause = where_clauses.join(" AND "),
    );

    let mut stmt = conn.prepare(&sql)?;
    let items = stmt
        .query_map(params_from_iter(bind.iter().map(|p| p.as_str())), |row| {
            Ok(TagCount {
                tag: row.get(0)?,
                count: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(items)
}
