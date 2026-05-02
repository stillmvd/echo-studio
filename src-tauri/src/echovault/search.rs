use std::collections::HashMap;

const FTS_STOPWORDS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on",
    "or", "that", "the", "this", "to", "with",
];

pub fn build_fts_query(query: &str) -> Option<String> {
    let raw_terms: Vec<String> = query
        .split(|c: char| !c.is_alphanumeric())
        .map(|t| t.to_lowercase())
        .filter(|t| !t.is_empty())
        .collect();

    if raw_terms.is_empty() {
        return None;
    }

    let filtered: Vec<&str> = raw_terms
        .iter()
        .filter(|t| t.chars().count() > 1 && !FTS_STOPWORDS.contains(&t.as_str()))
        .map(|t| t.as_str())
        .collect();

    let chosen: Vec<&str> = if filtered.is_empty() {
        raw_terms.iter().map(|t| t.as_str()).collect()
    } else {
        filtered
    };

    let mut seen = std::collections::HashSet::new();
    let mut unique: Vec<&str> = Vec::new();
    for term in chosen {
        if seen.insert(term) {
            unique.push(term);
        }
    }

    if unique.is_empty() {
        return None;
    }

    let joined = unique
        .iter()
        .map(|t| {
            let escaped = t.replace('"', "\"\"");
            format!("\"{escaped}\"*")
        })
        .collect::<Vec<_>>()
        .join(" OR ");
    Some(joined)
}

pub fn merge_rrf(lex: Vec<(i64, f64)>, sem: Vec<(i64, f64)>, k: i64) -> Vec<(i64, f64)> {
    let kf = k as f64;
    let mut scores: HashMap<i64, f64> = HashMap::new();
    for (rank, (rowid, _)) in lex.iter().enumerate() {
        *scores.entry(*rowid).or_insert(0.0) += 1.0 / (kf + rank as f64 + 1.0);
    }
    for (rank, (rowid, _)) in sem.iter().enumerate() {
        *scores.entry(*rowid).or_insert(0.0) += 1.0 / (kf + rank as f64 + 1.0);
    }
    let mut out: Vec<(i64, f64)> = scores.into_iter().collect();
    out.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fts_drops_stopwords() {
        assert_eq!(
            build_fts_query("the quick brown fox"),
            Some(r#""quick"* OR "brown"* OR "fox"*"#.to_string())
        );
    }

    #[test]
    fn fts_drops_short() {
        assert_eq!(build_fts_query("a b cd e"), Some(r#""cd"*"#.to_string()));
    }

    #[test]
    fn fts_falls_back_to_raw_when_all_stopwords() {
        assert_eq!(
            build_fts_query("the and a"),
            Some(r#""the"* OR "and"* OR "a"*"#.to_string())
        );
    }

    #[test]
    fn fts_empty_input() {
        assert_eq!(build_fts_query(""), None);
        assert_eq!(build_fts_query("   "), None);
        assert_eq!(build_fts_query("..."), None);
    }

    #[test]
    fn fts_dedup() {
        assert_eq!(
            build_fts_query("dota dota coach"),
            Some(r#""dota"* OR "coach"*"#.to_string())
        );
    }

    #[test]
    fn fts_unicode() {
        let q = build_fts_query("кириллица проверка").unwrap();
        assert!(q.contains("кириллица"));
        assert!(q.contains("проверка"));
    }

    #[test]
    fn rrf_higher_rank_wins() {
        // 10 ranks #0 in both lists → wins via cumulative score
        let lex = vec![(10, 0.0), (20, 0.0), (30, 0.0)];
        let sem = vec![(10, 0.0), (40, 0.0)];
        let merged = merge_rrf(lex, sem, 60);
        assert_eq!(merged.first().map(|(id, _)| *id), Some(10));
    }

    #[test]
    fn rrf_only_lexical() {
        let lex = vec![(10, 0.0), (20, 0.0)];
        let merged = merge_rrf(lex, vec![], 60);
        assert_eq!(merged.first().map(|(id, _)| *id), Some(10));
        assert_eq!(merged.len(), 2);
    }
}
