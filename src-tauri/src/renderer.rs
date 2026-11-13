use std::ffi::OsString;
use std::sync::Mutex;
use std::time::Instant;

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{AppHandle, Manager};

const WEBVIEW_EXE: &str = "msedgewebview2.exe";

struct Mark {
    at: Instant,
    cpu_ms: u64,
}

static LAST: Mutex<Option<Mark>> = Mutex::new(None);

fn is_renderer(cmd: &[OsString], profile: &str) -> bool {
    let line = cmd
        .iter()
        .map(|a| a.to_string_lossy().to_lowercase())
        .collect::<Vec<_>>()
        .join(" ");
    line.contains("--type=renderer") && line.contains(profile)
}

fn percent(prev: &Mark, next: &Mark) -> Option<f64> {
    let wall = next.at.duration_since(prev.at).as_millis();
    if wall == 0 || next.cpu_ms < prev.cpu_ms {
        return None;
    }
    Some((next.cpu_ms - prev.cpu_ms) as f64 * 100.0 / wall as f64)
}

fn sample(profile: &str) -> Option<f64> {
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_cmd(UpdateKind::Always)
            .with_cpu(),
    );
    let cpu_ms = sys
        .processes()
        .values()
        .filter(|p| p.name().eq_ignore_ascii_case(WEBVIEW_EXE) && is_renderer(p.cmd(), profile))
        .map(|p| p.accumulated_cpu_time())
        .sum();
    let next = Mark {
        at: Instant::now(),
        cpu_ms,
    };
    let mut last = LAST.lock().ok()?;
    let prev = last.replace(next)?;
    percent(&prev, last.as_ref()?)
}

#[tauri::command]
pub async fn renderer_load(app: AppHandle) -> Result<Option<f64>, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let profile = format!("{}\\ebwebview", dir.to_string_lossy().to_lowercase());
    tauri::async_runtime::spawn_blocking(move || sample(&profile))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn cmd(line: &str) -> Vec<OsString> {
        line.split(' ').map(OsString::from).collect()
    }

    #[test]
    fn picks_only_own_renderer() {
        let own = "c:\\users\\u\\appdata\\local\\com.stillmvd.echo-studio\\ebwebview";
        assert!(is_renderer(
            &cmd("msedgewebview2.exe --type=renderer --user-data-dir=C:\\Users\\u\\AppData\\Local\\com.stillmvd.echo-studio\\EBWebView"),
            own,
        ));
        assert!(!is_renderer(
            &cmd("msedgewebview2.exe --type=gpu-process --user-data-dir=C:\\Users\\u\\AppData\\Local\\com.stillmvd.echo-studio\\EBWebView"),
            own,
        ));
        assert!(!is_renderer(
            &cmd("msedgewebview2.exe --type=renderer --user-data-dir=C:\\Users\\u\\AppData\\Local\\com.stillmvd.echo-studio.check\\EBWebView"),
            own,
        ));
    }

    #[test]
    fn percent_of_one_core() {
        let at = Instant::now();
        let prev = Mark { at, cpu_ms: 1_000 };
        let next = Mark {
            at: at + Duration::from_secs(10),
            cpu_ms: 12_000,
        };
        assert_eq!(percent(&prev, &next), Some(110.0));
        assert_eq!(percent(&next, &prev), None);
    }
}
