use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::tooling::write::write_text_atomic;

use super::MemoryRecord;

pub const THRESHOLD: f64 = 0.72;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicatePair {
    pub slug: String,
    pub a: MemoryRecord,
    pub b: MemoryRecord,
    pub score: f64,
}

fn normalize(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn bigrams(s: &str) -> HashMap<(char, char), usize> {
    let chars: Vec<char> = s.chars().collect();
    let mut out = HashMap::new();
    for w in chars.windows(2) {
        *out.entry((w[0], w[1])).or_insert(0) += 1;
    }
    out
}

pub fn dice(a: &str, b: &str) -> f64 {
    let (a, b) = (normalize(a), normalize(b));
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    if a == b {
        return 1.0;
    }
    let (x, y) = (bigrams(&a), bigrams(&b));
    let total: usize = x.values().sum::<usize>() + y.values().sum::<usize>();
    if total == 0 {
        return 0.0;
    }
    let common: usize = x
        .iter()
        .map(|(k, n)| (*n).min(*y.get(k).unwrap_or(&0)))
        .sum();
    2.0 * common as f64 / total as f64
}

fn words(s: &str) -> HashSet<String> {
    normalize(s)
        .split(' ')
        .filter(|w| w.chars().count() >= 3)
        .map(str::to_string)
        .collect()
}

pub fn shared_words(a: &str, b: &str) -> f64 {
    let (x, y) = (words(a), words(b));
    let common = x.intersection(&y).count();
    let all = x.len() + y.len() - common;
    if all == 0 {
        0.0
    } else {
        common as f64 / all as f64
    }
}

pub fn score(a: &MemoryRecord, b: &MemoryRecord) -> f64 {
    if a.description.trim().is_empty() || b.description.trim().is_empty() {
        return dice(&a.name, &b.name);
    }
    dice(&a.description, &b.description).min(0.5 + shared_words(&a.description, &b.description))
}

pub fn pair_key(slug: &str, a: &str, b: &str) -> String {
    let (x, y) = if a <= b { (a, b) } else { (b, a) };
    format!("{slug}/{x}|{y}")
}

pub fn load_ignored(file: &Path) -> HashSet<String> {
    fs::read_to_string(file)
        .ok()
        .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
        .unwrap_or_default()
        .into_iter()
        .collect()
}

pub fn set_ignored(file: &Path, key: &str, ignored: bool) -> Result<(), String> {
    let mut keys: Vec<String> = load_ignored(file).into_iter().collect();
    keys.retain(|k| k != key);
    if ignored {
        keys.push(key.to_string());
    }
    keys.sort();
    let text = serde_json::to_string_pretty(&keys).map_err(|e| e.to_string())?;
    write_text_atomic(file, &text)
}

pub fn find(slug: &str, records: &[MemoryRecord]) -> Vec<DuplicatePair> {
    let live: Vec<&MemoryRecord> = records
        .iter()
        .filter(|r| r.error.is_none() && !r.archived)
        .collect();
    let mut pairs = Vec::new();
    for (i, a) in live.iter().enumerate() {
        for b in &live[i + 1..] {
            let s = score(a, b);
            if s >= THRESHOLD {
                pairs.push(DuplicatePair {
                    slug: slug.to_string(),
                    a: (*a).clone(),
                    b: (*b).clone(),
                    score: (s * 100.0).round() / 100.0,
                });
            }
        }
    }
    pairs.sort_by(|x, y| y.score.total_cmp(&x.score));
    pairs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scores_similar_text() {
        assert_eq!(dice("Echo Studio", "echo-studio"), 1.0);
        assert!(dice("redesign direction trail", "trail redesign direction") > 0.72);
        assert!(
            dice(
                "Деление на ноль бросает RangeError",
                "Деление на ноль → RangeError"
            ) > 0.72
        );
        assert!(dice("Git Bash превращает путь", "Tauri CSP запрещает eval") < 0.4);
        assert_eq!(dice("", "x"), 0.0);
    }

    fn rec(name: &str, description: &str) -> MemoryRecord {
        let mut r = crate::memory::scan::read_record(std::path::Path::new("missing.md"), false);
        r.name = name.into();
        r.description = description.into();
        r.error = None;
        r
    }

    #[test]
    fn ignored_pairs_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("ignored.json");
        let key = pair_key("C--a", "b.md", "a.md");
        assert_eq!(key, "C--a/a.md|b.md");
        set_ignored(&file, &key, true).unwrap();
        assert!(load_ignored(&file).contains(&key));
        set_ignored(&file, &key, false).unwrap();
        assert!(load_ignored(&file).is_empty());
    }

    #[test]
    fn similar_names_with_different_meaning_are_not_duplicates() {
        let old = rec("old-deploy-flow", "Деплой через ручной scp на сервер");
        let new = rec("new-deploy-flow", "Деплой через GitHub Actions по тегу");
        assert!(score(&old, &new) < THRESHOLD);
        let a = rec(
            "pixel-no-monkey",
            "Не запускать приложение на Pixel через adb monkey — он крутит экран; только am start",
        );
        let b = rec(
            "pixel-am-start-only",
            "Не запускать приложение на Pixel через adb monkey — он крутит экран; запускать только am start",
        );
        assert!(score(&a, &b) > 0.9);
        assert!(score(&rec("echo-studio", ""), &rec("Echo Studio", "")) >= THRESHOLD);
    }
}
