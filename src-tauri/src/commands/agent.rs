use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::agent::{self, AgentKind, Profile};

pub const EVENT_AGENT: &str = "echo://agent-changed";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentView {
    #[serde(flatten)]
    pub profile: Profile,
    pub cli: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Agents {
    pub current: AgentKind,
    pub agents: Vec<AgentView>,
}

fn snapshot() -> Result<Agents, String> {
    let home = agent::home().ok_or("Не найдена домашняя папка")?;
    let agents = AgentKind::ALL
        .into_iter()
        .map(|kind| {
            let profile = Profile::of(kind, &home);
            let cli = profile.find_cli().map(|p| p.to_string_lossy().into_owned());
            AgentView { profile, cli }
        })
        .collect();
    Ok(Agents {
        current: agent::current_kind(),
        agents,
    })
}

#[tauri::command]
pub async fn get_agents() -> Result<Agents, String> {
    tauri::async_runtime::spawn_blocking(snapshot)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn set_agent(app: AppHandle, kind: AgentKind) -> Result<Agents, String> {
    if kind != agent::current_kind() {
        let home = agent::home().ok_or("Не найдена домашняя папка")?;
        let profile = Profile::of(kind, &home);
        if profile.find_cli().is_none() {
            return Err(format!(
                "{} не найден ни в PATH, ни в {}",
                profile.exe,
                profile.bin.display()
            ));
        }
        agent::set_current(kind)?;
        let _ = app.emit(EVENT_AGENT, kind);
    }
    get_agents().await
}
