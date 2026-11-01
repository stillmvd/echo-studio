use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentKind {
    #[default]
    Claude,
    Kimi,
}

impl AgentKind {
    pub const ALL: [AgentKind; 2] = [AgentKind::Claude, AgentKind::Kimi];

    pub fn project_dir(self) -> &'static str {
        match self {
            AgentKind::Claude => ".claude",
            AgentKind::Kimi => ".kimi-code",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Transcript {
    ClaudeJsonl,
    KimiWire,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub kind: AgentKind,
    pub name: &'static str,
    pub home: PathBuf,
    pub settings: PathBuf,
    pub mcp: PathBuf,
    pub plugins: PathBuf,
    pub sessions: PathBuf,
    pub instructions: PathBuf,
    pub project_dir: &'static str,
    pub exe: &'static str,
    pub bin: PathBuf,
    pub transcript: Transcript,
    pub has_daemon: bool,
}

pub const CLAUDE_EXE: &str = "claude.exe";
pub const KIMI_EXE: &str = "kimi.exe";

impl Profile {
    pub fn of(kind: AgentKind, home: &Path) -> Self {
        Self::build(
            kind,
            home,
            std::env::var_os("KIMI_CODE_HOME").map(PathBuf::from),
        )
    }

    pub fn claude(home: &Path) -> Self {
        Self::of(AgentKind::Claude, home)
    }

    fn build(kind: AgentKind, home: &Path, kimi_home: Option<PathBuf>) -> Self {
        match kind {
            AgentKind::Claude => {
                let data = home.join(".claude");
                Profile {
                    kind,
                    name: "Claude Code",
                    settings: data.join("settings.json"),
                    mcp: home.join(".claude.json"),
                    plugins: data.join("plugins").join("installed_plugins.json"),
                    sessions: data.join("projects"),
                    instructions: data.join("CLAUDE.md"),
                    project_dir: kind.project_dir(),
                    exe: CLAUDE_EXE,
                    bin: home.join(".local").join("bin").join(CLAUDE_EXE),
                    transcript: Transcript::ClaudeJsonl,
                    has_daemon: true,
                    home: data,
                }
            }
            AgentKind::Kimi => {
                let data = kimi_home
                    .filter(|p| !p.as_os_str().is_empty())
                    .unwrap_or_else(|| home.join(".kimi-code"));
                Profile {
                    kind,
                    name: "Kimi Code",
                    settings: data.join("config.toml"),
                    mcp: data.join("mcp.json"),
                    plugins: data.join("plugins").join("installed.json"),
                    sessions: data.join("sessions"),
                    instructions: data.join("AGENTS.md"),
                    project_dir: kind.project_dir(),
                    exe: KIMI_EXE,
                    bin: data.join("bin").join(KIMI_EXE),
                    transcript: Transcript::KimiWire,
                    has_daemon: false,
                    home: data,
                }
            }
        }
    }

    pub fn find_cli(&self) -> Option<PathBuf> {
        in_path(self.exe).or_else(|| Some(self.bin.clone()).filter(|p| p.is_file()))
    }

    pub fn cli(&self) -> PathBuf {
        self.find_cli()
            .unwrap_or_else(|| PathBuf::from(self.exe.trim_end_matches(".exe")))
    }

    pub fn command(&self) -> &'static str {
        self.exe.trim_end_matches(".exe")
    }

    pub fn resume_args(&self, id: &str) -> [String; 2] {
        let flag = match self.kind {
            AgentKind::Claude => "--resume",
            AgentKind::Kimi => "-S",
        };
        [flag.to_string(), id.to_string()]
    }
}

pub fn home() -> Option<PathBuf> {
    dirs::home_dir()
}

pub fn claude() -> Option<Profile> {
    home().map(|h| Profile::claude(&h))
}

pub fn in_path(exe: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(exe))
            .find(|p| p.is_file())
    })
}

pub fn claude_cli() -> PathBuf {
    match claude() {
        Some(p) => p.cli(),
        None => in_path(CLAUDE_EXE).unwrap_or_else(|| PathBuf::from("claude")),
    }
}

pub fn status_dir(home: &Path) -> PathBuf {
    home.join(".claude").join("state").join("sessions")
}

pub fn memory_root(home: &Path) -> PathBuf {
    home.join(".claude").join("projects")
}

static CURRENT: RwLock<AgentKind> = RwLock::new(AgentKind::Claude);
static STORE: OnceLock<PathBuf> = OnceLock::new();

#[derive(Serialize, Deserialize)]
struct Stored {
    agent: AgentKind,
}

pub fn current_kind() -> AgentKind {
    CURRENT.read().map(|k| *k).unwrap_or_default()
}

pub fn load(data_dir: &Path) {
    let path = data_dir.join("agent.json");
    let kind = read_stored(&path).unwrap_or_default();
    let _ = STORE.set(path);
    if let Ok(mut k) = CURRENT.write() {
        *k = kind;
    }
}

fn read_stored(path: &Path) -> Option<AgentKind> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Stored>(&text).ok().map(|s| s.agent)
}

pub fn set_current(kind: AgentKind) -> Result<(), String> {
    let path = STORE.get().ok_or("Папка настроек приложения не найдена")?;
    write_stored(path, kind)?;
    if let Ok(mut k) = CURRENT.write() {
        *k = kind;
    }
    Ok(())
}

fn write_stored(path: &Path, kind: AgentKind) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let text = serde_json::to_string_pretty(&Stored { agent: kind }).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| format!("{}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("{}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_profile_keeps_existing_paths() {
        let home = Path::new(r"C:\Users\me");
        let p = Profile::build(AgentKind::Claude, home, None);
        assert_eq!(p.home, home.join(".claude"));
        assert_eq!(p.settings, home.join(r".claude\settings.json"));
        assert_eq!(p.mcp, home.join(".claude.json"));
        assert_eq!(
            p.plugins,
            home.join(r".claude\plugins\installed_plugins.json")
        );
        assert_eq!(p.sessions, home.join(r".claude\projects"));
        assert_eq!(p.bin, home.join(r".local\bin\claude.exe"));
        assert_eq!(
            p.resume_args("abc"),
            ["--resume".to_string(), "abc".to_string()]
        );
        assert_eq!(p.command(), "claude");
        assert!(p.has_daemon);
    }

    #[test]
    fn kimi_profile_follows_kimi_code_home() {
        let home = Path::new(r"C:\Users\me");
        let p = Profile::build(AgentKind::Kimi, home, None);
        assert_eq!(p.home, home.join(".kimi-code"));
        assert_eq!(p.settings, home.join(r".kimi-code\config.toml"));
        assert_eq!(p.mcp, home.join(r".kimi-code\mcp.json"));
        assert_eq!(p.sessions, home.join(r".kimi-code\sessions"));
        assert_eq!(p.bin, home.join(r".kimi-code\bin\kimi.exe"));
        assert_eq!(p.project_dir, ".kimi-code");
        assert_eq!(p.resume_args("s1"), ["-S".to_string(), "s1".to_string()]);
        assert!(!p.has_daemon);

        let custom = Profile::build(AgentKind::Kimi, home, Some(PathBuf::from(r"D:\k")));
        assert_eq!(custom.home, PathBuf::from(r"D:\k"));
        assert_eq!(custom.sessions, PathBuf::from(r"D:\k\sessions"));
        let empty = Profile::build(AgentKind::Kimi, home, Some(PathBuf::new()));
        assert_eq!(empty.home, home.join(".kimi-code"));
    }

    #[test]
    fn shared_paths_stay_under_claude() {
        let home = Path::new(r"C:\Users\me");
        assert_eq!(status_dir(home), home.join(r".claude\state\sessions"));
        assert_eq!(memory_root(home), home.join(r".claude\projects"));
    }

    #[test]
    fn stored_choice_round_trips_and_defaults_to_claude() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub").join("agent.json");
        assert_eq!(read_stored(&path), None);
        write_stored(&path, AgentKind::Kimi).unwrap();
        assert_eq!(read_stored(&path), Some(AgentKind::Kimi));
        fs::write(&path, "{broken").unwrap();
        assert_eq!(read_stored(&path).unwrap_or_default(), AgentKind::Claude);
    }
}
