use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, params_from_iter, Connection, OpenFlags, Row};
use serde_json::Value as JsonValue;

use super::error::{EchoVaultError, Result};
use super::models::{
    CategoryCount, MemoriesFilter, MemoriesPage, Memory, MemoryWithBody, ProjectCount,
};
use super::paths::{index_db_path, resolve_memory_home};

pub struct EchoVaultRepo {
    conn: Mutex<Connection>,
    memory_home: PathBuf,
    home_source: &'static str,
}

impl EchoVaultRepo {
    pub fn open() -> Result<Self> {
        let (home, source) = resolve_memory_home()?;
        let db_path = index_db_path(&home);
        if !db_path.exists() {
            return Err(EchoVaultError::NotInitialized(
                db_path.to_string_lossy().to_string(),
            ));
        }
        let conn = Connection::open_with_flags(
            &db_path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
            memory_home: home,
            home_source: source,
        })
    }

    pub fn home(&self) -> &PathBuf {
        &self.memory_home
    }

    pub fn home_source(&self) -> &'static str {
        self.home_source
    }

    pub fn list(&self, filter: &MemoriesFilter) -> Result<MemoriesPage> {
        let conn = self.conn.lock().expect("poisoned conn mutex");
        let limit = filter.limit.unwrap_or(200).clamp(1, 1000);
        let offset = filter.offset.unwrap_or(0).max(0);

        let (where_sql, where_params) = build_where(filter);

        let count_sql = format!("SELECT COUNT(*) FROM memories WHERE {where_sql}");
        let total: i64 = conn.query_row(
            &count_sql,
            params_from_iter(where_params.iter().map(|p| p.as_str())),
            |row| row.get(0),
        )?;

        let list_sql = format!(
            "SELECT id, title, what, why, impact, tags, category, project, source,
                    related_files, file_path, section_anchor, created_at, updated_at,
                    COALESCE(status, 'active'), archived_at, archive_reason, superseded_by,
                    COALESCE(updated_count, 0)
             FROM memories
             WHERE {where_sql}
             ORDER BY datetime(updated_at) DESC
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

        let projects = collect_project_counts(&conn)?;
        let categories = collect_category_counts(&conn)?;

        Ok(MemoriesPage {
            total,
            items: rows,
            projects,
            categories,
            memory_home: self.memory_home.to_string_lossy().to_string(),
            home_source: self.home_source.to_string(),
        })
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
}

fn build_where(filter: &MemoriesFilter) -> (String, Vec<String>) {
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
        tags: parse_json_array(row.get::<_, Option<String>>(5)?, "tags"),
        category: row.get(6)?,
        project: row.get(7)?,
        source: row.get(8)?,
        related_files: parse_json_array(row.get::<_, Option<String>>(9)?, "related_files"),
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

fn parse_json_array(raw: Option<String>, _column: &'static str) -> Vec<String> {
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
