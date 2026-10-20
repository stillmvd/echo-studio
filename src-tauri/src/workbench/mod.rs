pub mod git;
pub mod limits;
pub mod processes;
pub mod projects;
pub mod sessions;
pub mod terminal;
pub mod usage;
pub mod watch;

use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn projects_root() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Projects"))
}

pub fn is_claude_env(key: &str) -> bool {
    key.to_ascii_uppercase().starts_with("CLAUDE")
}

pub fn child_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    for (key, _) in std::env::vars_os() {
        if is_claude_env(&key.to_string_lossy()) {
            cmd.env_remove(&key);
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_env_keys() {
        assert!(is_claude_env("CLAUDECODE"));
        assert!(is_claude_env("CLAUDE_CODE_ENTRYPOINT"));
        assert!(is_claude_env("claude_x"));
        assert!(!is_claude_env("PATH"));
    }
}
