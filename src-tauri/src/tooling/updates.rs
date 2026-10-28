use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use super::actions::output_within;
use super::paths::{claude_dir, installed_plugins};
use crate::workbench::child_command;
use crate::workbench::sessions::claude_exe;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Update {
    pub id: String,
    pub current: String,
    pub latest: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub updates: Vec<Update>,
    pub errors: Vec<String>,
}

fn json(path: &Path) -> Option<Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

fn output(program: &str, args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd = child_command(program);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let out = output_within(cmd, Duration::from_secs(90)).map_err(|e| format!("{program}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        Err(err
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("ошибка")
            .trim()
            .to_string())
    }
}

pub fn latest_plugin(market_dir: &Path, name: &str) -> Option<(Option<String>, bool)> {
    let manifest = json(&market_dir.join(".claude-plugin").join("marketplace.json"))?;
    let all = manifest.get("plugins")?.as_array()?;
    let entry = all
        .iter()
        .find(|p| p.get("name").and_then(Value::as_str) == Some(name))?;
    let local = entry.get("source").and_then(Value::as_str);
    let version = entry
        .get("version")
        .and_then(Value::as_str)
        .map(String::from)
        .or_else(|| {
            let dir = market_dir.join(local?);
            json(&dir.join(".claude-plugin").join("plugin.json"))?
                .get("version")?
                .as_str()
                .map(String::from)
        });
    Some((version, local.is_some() && all.len() == 1))
}

pub fn compare(
    current: Option<&str>,
    sha: Option<&str>,
    latest: Option<&str>,
    head: Option<&str>,
) -> Option<(String, String)> {
    match (current, latest) {
        (Some(c), Some(l)) if c != l => Some((c.into(), l.into())),
        (Some(_), Some(_)) => None,
        _ => match (sha, head) {
            (Some(s), Some(h)) if !s.eq_ignore_ascii_case(h) => {
                Some((s.chars().take(7).collect(), h.chars().take(7).collect()))
            }
            _ => None,
        },
    }
}

fn check_plugins(home: &Path, out: &mut Check) {
    if let Err(e) = output(
        &claude_exe().to_string_lossy(),
        &["plugin", "marketplace", "update"],
        None,
    ) {
        out.errors.push(format!("Маркетплейсы: {e}"));
    }
    let markets = json(
        &claude_dir(home)
            .join("plugins")
            .join("known_marketplaces.json"),
    )
    .unwrap_or_default();
    let installed = json(&installed_plugins(home)).unwrap_or_default();
    let Some(plugins) = installed.get("plugins").and_then(Value::as_object) else {
        return;
    };
    for (key, list) in plugins {
        let Some(p) = list.as_array().and_then(|l| l.first()) else {
            continue;
        };
        let Some((name, market)) = key.split_once('@') else {
            continue;
        };
        let Some(m) = markets.get(market) else {
            continue;
        };
        if m.pointer("/source/source").and_then(Value::as_str) == Some("directory") {
            continue;
        }
        let Some(dir) = m
            .get("installLocation")
            .and_then(Value::as_str)
            .map(Path::new)
        else {
            continue;
        };
        let Some((latest, local)) = latest_plugin(dir, name) else {
            continue;
        };
        let head = if local {
            output("git", &["rev-parse", "HEAD"], Some(dir)).ok()
        } else {
            None
        };
        let s = |k: &str| p.get(k).and_then(Value::as_str);
        if let Some((current, latest)) = compare(
            s("version"),
            s("gitCommitSha"),
            latest.as_deref(),
            head.as_deref(),
        ) {
            out.updates.push(Update {
                id: format!("plugin:plugin:{key}"),
                current,
                latest,
            });
        }
    }
}

pub fn folder_sha(listing: &str, folder: &str) -> Option<String> {
    let v: Value = serde_json::from_str(listing).ok()?;
    v.as_array()?
        .iter()
        .find(|e| {
            e.get("name").and_then(Value::as_str) == Some(folder)
                && e.get("type").and_then(Value::as_str) == Some("dir")
        })?
        .get("sha")?
        .as_str()
        .map(String::from)
}

fn check_skills(home: &Path, out: &mut Check) {
    let lock = json(&home.join(".agents").join(".skill-lock.json")).unwrap_or_default();
    let Some(skills) = lock.get("skills").and_then(Value::as_object) else {
        return;
    };
    type Skill = (String, String, String);
    let mut groups: BTreeMap<(String, String), Vec<Skill>> = BTreeMap::new();
    for (name, s) in skills {
        let g = |k: &str| s.get(k).and_then(Value::as_str);
        let (Some("github"), Some(source), Some(path), Some(hash)) = (
            g("sourceType"),
            g("source"),
            g("skillPath"),
            g("skillFolderHash"),
        ) else {
            continue;
        };
        let folder = Path::new(path).parent();
        let (Some(folder_name), Some(parent)) = (
            folder.and_then(Path::file_name),
            folder.and_then(Path::parent),
        ) else {
            continue;
        };
        groups
            .entry((source.into(), parent.to_string_lossy().replace('\\', "/")))
            .or_default()
            .push((
                name.clone(),
                folder_name.to_string_lossy().into_owned(),
                hash.into(),
            ));
    }
    for ((repo, parent), list) in groups {
        let url = format!("https://api.github.com/repos/{repo}/contents/{parent}");
        match output(
            "curl.exe",
            &[
                "-sSfL",
                "--max-time",
                "20",
                "-H",
                "User-Agent: echo-studio",
                &url,
            ],
            None,
        ) {
            Ok(body) => {
                for (name, folder, hash) in list {
                    if let Some(sha) = folder_sha(&body, &folder).filter(|s| s != &hash) {
                        out.updates.push(Update {
                            id: format!("skill:user:{name}"),
                            current: hash.chars().take(7).collect(),
                            latest: sha.chars().take(7).collect(),
                        });
                    }
                }
            }
            Err(e) => out.errors.push(format!("{repo}: {e}")),
        }
    }
}

pub fn check(home: &Path) -> Check {
    let mut out = Check::default();
    check_plugins(home, &mut out);
    check_skills(home, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions_then_commits() {
        assert_eq!(
            compare(Some("4.10.0"), None, Some("4.11.0"), None),
            Some(("4.10.0".into(), "4.11.0".into()))
        );
        assert_eq!(
            compare(Some("4.10.0"), Some("aaaa"), Some("4.10.0"), Some("bbbb")),
            None
        );
        assert_eq!(
            compare(Some("1.0"), Some("abcdef1234"), None, Some("1234567890")),
            Some(("abcdef1".into(), "1234567".into()))
        );
        assert_eq!(compare(None, Some("ABC"), None, Some("abc")), None);
        assert_eq!(compare(Some("1.0"), None, None, None), None);
    }

    #[test]
    fn reads_latest_from_marketplace() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        fs::create_dir_all(d.join(".claude-plugin")).unwrap();
        fs::create_dir_all(d.join("p/.claude-plugin")).unwrap();
        fs::write(d.join(".claude-plugin/marketplace.json"), r#"{"plugins":[{"name":"a","version":"2.0"},{"name":"b","source":"./p"},{"name":"c","source":{"source":"github"}}]}"#).unwrap();
        fs::write(
            d.join("p/.claude-plugin/plugin.json"),
            r#"{"version":"3.1"}"#,
        )
        .unwrap();
        assert_eq!(latest_plugin(d, "a"), Some((Some("2.0".into()), false)));
        assert_eq!(latest_plugin(d, "b"), Some((Some("3.1".into()), false)));
        assert_eq!(latest_plugin(d, "c"), Some((None, false)));
        assert_eq!(latest_plugin(d, "z"), None);
    }

    #[test]
    fn finds_folder_sha_in_listing() {
        let body = r#"[{"name":"hyperframes","type":"dir","sha":"abc"},{"name":"README.md","type":"file","sha":"f"}]"#;
        assert_eq!(folder_sha(body, "hyperframes"), Some("abc".into()));
        assert_eq!(folder_sha(body, "README.md"), None);
        assert_eq!(folder_sha("{\"message\":\"rate limit\"}", "x"), None);
    }
}
