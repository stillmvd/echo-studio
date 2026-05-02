use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationProject {
    pub id: String,
    pub cwd: String,
    pub display_name: String,
    pub session_count: usize,
    pub total_size: u64,
    pub last_activity: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub session_id: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub message_count: u32,
    pub first_event_at: Option<String>,
    pub last_event_at: Option<String>,
    pub duration_ms: i64,
    pub git_branch: Option<String>,
    pub cwd: Option<String>,
}
