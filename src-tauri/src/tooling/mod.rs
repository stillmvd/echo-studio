pub mod effective;
pub mod frontmatter;
pub mod mcp;
pub mod paths;
pub mod plugins;
pub mod scan;
pub mod settings;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScopeKind {
    Global,
    Project,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeRef {
    pub kind: ScopeKind,
    pub path: Option<String>,
    pub name: String,
    pub available: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Skill,
    Command,
    Agent,
    Plugin,
    Mcp,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Skill => "skill",
            Kind::Command => "command",
            Kind::Agent => "agent",
            Kind::Plugin => "plugin",
            Kind::Mcp => "mcp",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Origin {
    User,
    Project,
    Local,
    Plugin,
}

impl Origin {
    pub fn as_str(self) -> &'static str {
        match self {
            Origin::User => "user",
            Origin::Project => "project",
            Origin::Local => "local",
            Origin::Plugin => "plugin",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum State {
    Enabled,
    Disabled,
    Unavailable,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Conflict {
    None,
    Overrides,
    Overridden,
    SameName,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ToggleFile {
    UserSettings,
    ProjectLocalSettings,
    ClaudeJson,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ToggleKey {
    EnabledPlugins,
    SkillOverrides,
    DisabledMcpServers,
    DisabledMcpjsonServers,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleTarget {
    pub file: ToggleFile,
    pub project_path: Option<String>,
    pub key: ToggleKey,
    pub name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginContents {
    pub skills: usize,
    pub commands: usize,
    pub agents: usize,
    pub mcp: usize,
    pub hooks: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub version: Option<String>,
    pub marketplace: String,
    pub installed_at: Option<String>,
    pub last_updated: Option<String>,
    pub install_path: String,
    pub contents: PluginContents,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpInfo {
    pub transport: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env: BTreeMap<String, String>,
    pub headers: BTreeMap<String, String>,
    pub declared_in: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolItem {
    pub id: String,
    pub kind: Kind,
    pub name: String,
    pub qualified_name: String,
    pub description: Option<String>,
    pub origin: Origin,
    pub plugin_key: Option<String>,
    pub file_path: Option<String>,
    pub state: State,
    pub override_mode: Option<String>,
    pub toggle: Option<ToggleTarget>,
    pub toggle_hint: Option<String>,
    pub conflict: Conflict,
    pub error: Option<String>,
    pub front_matter: Option<Map<String, Value>>,
    pub plugin: Option<PluginInfo>,
    pub mcp: Option<McpInfo>,
}

impl ToolItem {
    pub fn new(kind: Kind, origin: Origin, name: String, qualified_name: String) -> Self {
        Self {
            id: format!("{}:{}:{}", kind.as_str(), origin.as_str(), qualified_name),
            kind,
            name,
            qualified_name,
            description: None,
            origin,
            plugin_key: None,
            file_path: None,
            state: State::Enabled,
            override_mode: None,
            toggle: None,
            toggle_hint: None,
            conflict: Conflict::None,
            error: None,
            front_matter: None,
            plugin: None,
            mcp: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceState {
    Ok,
    Missing,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    pub path: String,
    pub status: SourceState,
    pub error: Option<String>,
}

impl SourceStatus {
    pub fn new(path: &std::path::Path, status: SourceState, error: Option<String>) -> Self {
        Self {
            path: path.to_string_lossy().into_owned(),
            status,
            error,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub scope: ScopeRef,
    pub items: Vec<ToolItem>,
    pub sources: Vec<SourceStatus>,
    pub counts: BTreeMap<String, usize>,
}
