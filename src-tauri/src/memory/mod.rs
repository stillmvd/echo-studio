pub mod dupes;
pub mod index;
pub mod scan;
pub mod watch;
pub mod write;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};

pub const MEMORY_DIR: &str = "memory";
pub const INDEX_FILE: &str = "MEMORY.md";
pub const SESSIONS_DIR: &str = "sessions";
pub const ARCHIVE_DIR: &str = ".archive";

pub fn projects_root(home: &Path) -> PathBuf {
    home.join(".claude").join("projects")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryProject {
    pub slug: String,
    pub name: String,
    pub cwd: Option<String>,
    pub memory_dir: String,
    pub records: usize,
    pub facts: usize,
    pub sessions: usize,
    pub archived: usize,
    pub index_lines: usize,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRecord {
    pub path: String,
    pub file: String,
    pub name: String,
    pub description: String,
    #[serde(rename = "type")]
    pub kind_type: Option<String>,
    pub kind: Option<String>,
    pub status: String,
    pub seen: u32,
    pub importance: u8,
    pub tags: Vec<String>,
    pub files: Vec<String>,
    pub supersedes: Option<String>,
    pub valid_to: Option<String>,
    pub consolidated_into: Option<String>,
    pub stale: bool,
    pub updated: String,
    pub archived: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionNote {
    pub path: String,
    pub session_id: Option<String>,
    pub title: String,
    pub capture: String,
    pub updated: String,
    pub next: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryListing {
    pub records: Vec<MemoryRecord>,
    pub sessions: Vec<SessionNote>,
    pub archived: Vec<MemoryRecord>,
    pub index_lines: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryHit {
    pub slug: String,
    pub path: String,
    pub line: usize,
    pub snippet: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordPatch {
    pub status: Option<String>,
    pub importance: Option<u8>,
    #[serde(default, deserialize_with = "some")]
    pub valid_to: Option<Option<String>>,
    #[serde(default, deserialize_with = "some")]
    pub supersedes: Option<Option<String>>,
}

fn some<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(d).map(Some)
}

pub fn field<'a>(fields: &'a Map<String, Value>, key: &str) -> Option<&'a Value> {
    fields
        .get("metadata")
        .and_then(Value::as_object)
        .and_then(|m| m.get(key))
        .filter(|v| !v.is_null())
        .or_else(|| fields.get(key).filter(|v| !v.is_null()))
}

pub fn field_str(fields: &Map<String, Value>, key: &str) -> Option<String> {
    match field(fields, key)? {
        Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

pub fn field_list(fields: &Map<String, Value>, key: &str) -> Vec<String> {
    match field(fields, key) {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|v| match v {
                Value::String(s) => Some(s.clone()),
                Value::Number(n) => Some(n.to_string()),
                _ => None,
            })
            .collect(),
        Some(Value::String(s)) if !s.is_empty() => vec![s.clone()],
        _ => Vec::new(),
    }
}
