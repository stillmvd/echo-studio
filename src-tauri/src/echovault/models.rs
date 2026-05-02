use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: String,
    pub title: String,
    pub what: String,
    pub why: Option<String>,
    pub impact: Option<String>,
    pub tags: Vec<String>,
    pub category: Option<String>,
    pub project: String,
    pub source: Option<String>,
    pub related_files: Vec<String>,
    pub file_path: String,
    pub section_anchor: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub status: String,
    pub archived_at: Option<String>,
    pub archive_reason: Option<String>,
    pub superseded_by: Option<String>,
    pub updated_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryWithBody {
    #[serde(flatten)]
    pub memory: Memory,
    pub body: Option<String>,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum SearchMode {
    #[default]
    Lexical,
    Semantic,
    Hybrid,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum SortBy {
    #[default]
    UpdatedDesc,
    CreatedDesc,
    TitleAsc,
    ProjectAsc,
}

impl SortBy {
    pub fn as_sql(&self) -> &'static str {
        match self {
            Self::UpdatedDesc => "datetime(updated_at) DESC",
            Self::CreatedDesc => "datetime(created_at) DESC",
            Self::TitleAsc => "title COLLATE NOCASE ASC",
            Self::ProjectAsc => "project COLLATE NOCASE ASC, datetime(updated_at) DESC",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct MemoriesFilter {
    pub project: Option<String>,
    pub category: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub query: Option<String>,
    pub mode: Option<SearchMode>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub sort_by: Option<SortBy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCount {
    pub project: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCount {
    pub category: Option<String>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoriesPage {
    pub total: i64,
    pub items: Vec<Memory>,
    pub projects: Vec<ProjectCount>,
    pub categories: Vec<CategoryCount>,
    pub tags: Vec<TagCount>,
    pub memory_home: String,
    pub home_source: String,
    pub mode_used: Option<SearchMode>,
    pub semantic_warning: Option<String>,
}
