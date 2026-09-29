use std::collections::HashMap;

use serde::Serialize;

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

pub fn score(a: &MemoryRecord, b: &MemoryRecord) -> f64 {
    dice(&a.name, &b.name).max(dice(&a.description, &b.description))
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
}
