use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

pub const EVENT_LIMITS: &str = "workbench://limits";
const FILE: &str = "rate-limits.json";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Limit {
    pub used_percentage: f64,
    pub resets_at: u64,
    pub reset: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RateLimits {
    pub five_hour: Option<Limit>,
    pub seven_day: Option<Limit>,
    pub updated_at: u64,
}

#[derive(Deserialize)]
struct RawLimit {
    used_percentage: Option<f64>,
    resets_at: Option<f64>,
}

#[derive(Deserialize)]
struct RawLimits {
    five_hour: Option<RawLimit>,
    seven_day: Option<RawLimit>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<u64>,
}

fn dir() -> PathBuf {
    std::env::temp_dir().join("claude-memory")
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn limit(raw: Option<RawLimit>, now: u64) -> Option<Limit> {
    let raw = raw?;
    let resets_at = raw.resets_at? as u64;
    Some(Limit {
        used_percentage: raw.used_percentage?,
        resets_at,
        reset: resets_at <= now,
    })
}

pub fn parse(text: &str, now: u64) -> Option<RateLimits> {
    let raw: RawLimits = serde_json::from_str(text).ok()?;
    Some(RateLimits {
        five_hour: limit(raw.five_hour, now),
        seven_day: limit(raw.seven_day, now),
        updated_at: raw.updated_at.unwrap_or(0),
    })
}

pub fn read() -> Option<RateLimits> {
    let text = std::fs::read_to_string(dir().join(FILE)).ok()?;
    parse(&text, now_secs())
}

pub fn start_limits(app: AppHandle) {
    std::thread::spawn(move || {
        let dir = dir();
        if std::fs::create_dir_all(&dir).is_err() {
            return;
        }
        let (tx, rx) = mpsc::channel::<DebounceEventResult>();
        let Ok(mut debouncer) = new_debouncer(Duration::from_millis(300), tx) else {
            return;
        };
        if debouncer
            .watcher()
            .watch(&dir, RecursiveMode::NonRecursive)
            .is_err()
        {
            return;
        }
        for events in rx {
            let Ok(events) = events else { continue };
            if events
                .iter()
                .any(|e| e.path.file_name().is_some_and(|n| n == FILE))
            {
                let _ = app.emit(EVENT_LIMITS, ());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_792_512_000;

    #[test]
    fn parses_bridge_file() {
        let text = r#"{"five_hour":{"used_percentage":81,"resets_at":1792515600},"seven_day":{"used_percentage":21.5,"resets_at":1792598400},"updatedAt":1792512477}"#;
        let limits = parse(text, NOW).unwrap();
        assert_eq!(
            limits.five_hour,
            Some(Limit {
                used_percentage: 81.0,
                resets_at: 1_792_515_600,
                reset: false
            })
        );
        assert_eq!(limits.seven_day.map(|l| l.used_percentage), Some(21.5));
        assert_eq!(limits.updated_at, 1_792_512_477);
    }

    #[test]
    fn past_reset_is_flagged_and_missing_values_are_none() {
        let text = r#"{"five_hour":{"used_percentage":95,"resets_at":1792500000},"seven_day":{"used_percentage":null,"resets_at":null},"updatedAt":1}"#;
        let limits = parse(text, NOW).unwrap();
        assert_eq!(limits.five_hour.map(|l| l.reset), Some(true));
        assert_eq!(limits.seven_day, None);
    }

    #[test]
    fn broken_file_is_none() {
        assert_eq!(parse("{not json", NOW), None);
    }
}
