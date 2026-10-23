pub mod dev;
pub mod git;
pub mod limits;
pub mod processes;
pub mod projects;
pub mod sessions;
pub mod terminal;
pub mod usage;
pub mod watch;
pub mod window;

use std::path::PathBuf;
use std::process::{Command, Stdio};

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
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
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

    #[cfg(windows)]
    #[test]
    fn spawns_when_own_std_handles_are_stale() {
        use windows_sys::Win32::System::Console::{GetStdHandle, SetStdHandle, STD_INPUT_HANDLE};
        let saved = unsafe { GetStdHandle(STD_INPUT_HANDLE) };
        unsafe { SetStdHandle(STD_INPUT_HANDLE, 0xDEAD0 as _) };
        let spawned = child_command("cmd.exe").args(["/d", "/c", "exit"]).spawn();
        unsafe { SetStdHandle(STD_INPUT_HANDLE, saved) };
        spawned.unwrap().wait().unwrap();
    }
}
