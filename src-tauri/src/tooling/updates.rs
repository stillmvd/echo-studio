use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use super::actions::output_within;
use super::inventory::Entry;
use super::paths::{claude_dir, installed_plugins};
use super::{Kind, Origin};
use crate::workbench::child_command;
use crate::workbench::sessions::claude_exe;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Update {
    pub id: String,
    pub current: String,
    pub latest: String,
    pub url: Option<String>,
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
                url: None,
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
                            url: None,
                        });
                    }
                }
            }
            Err(e) => out.errors.push(format!("{repo}: {e}")),
        }
    }
}

fn get(url: &str) -> Result<Value, String> {
    let body = output(
        "curl.exe",
        &[
            "-sSfL",
            "--max-time",
            "20",
            "-H",
            "User-Agent: echo-studio",
            url,
        ],
        None,
    )?;
    serde_json::from_str(&body).map_err(|e| format!("{url}: {e}"))
}

pub fn npm_pin(args: &[String]) -> Option<(usize, String, String)> {
    args.iter().enumerate().find_map(|(i, a)| {
        let (pkg, ver) = a.rsplit_once('@')?;
        let core = ver.split(['-', '+']).next().unwrap_or_default();
        let ok = !pkg.is_empty()
            && !pkg.ends_with('/')
            && core.split('.').count() == 3
            && core
                .split('.')
                .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()));
        ok.then(|| (i, pkg.to_string(), ver.to_string()))
    })
}

pub fn npm_latest(pkg: &str) -> Result<String, String> {
    get(&format!("https://registry.npmjs.org/{pkg}/latest"))?
        .get("version")
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| format!("{pkg}: нет версии в npm"))
}

pub fn git_dir(e: &Entry) -> Option<PathBuf> {
    let dir = match e.item.kind {
        Kind::Skill => Path::new(e.item.file_path.as_deref()?)
            .parent()?
            .to_path_buf(),
        Kind::Mcp => e
            .item
            .mcp
            .as_ref()?
            .args
            .iter()
            .map(PathBuf::from)
            .find(|p| p.is_absolute() && p.join(".git").exists())?,
        _ => return None,
    };
    dir.join(".git").exists().then_some(dir)
}

fn check_git(id: &str, dir: &Path, out: &mut Check) {
    let name = dir.file_name().map(|n| n.to_string_lossy().into_owned());
    let name = name.unwrap_or_default();
    if let Err(e) = output("git", &["fetch", "--quiet"], Some(dir)) {
        out.errors.push(format!("{name}: {e}"));
        return;
    }
    let behind = output("git", &["rev-list", "--count", "HEAD..@{u}"], Some(dir));
    let short = |r: &str| output("git", &["rev-parse", "--short", r], Some(dir)).ok();
    if behind.is_ok_and(|n| n != "0") {
        if let (Some(current), Some(latest)) = (short("HEAD"), short("@{u}")) {
            out.updates.push(Update {
                id: id.into(),
                current,
                latest,
                url: None,
            });
        }
    }
}

pub fn version_of(text: &str) -> Option<String> {
    text.split_whitespace()
        .rev()
        .map(|t| t.trim_start_matches('v'))
        .find(|t| t.starts_with(|c: char| c.is_ascii_digit()) && t.contains('.'))
        .map(String::from)
}

fn check_release(id: &str, exe: &Path, out: &mut Check) {
    let Some(stem) = exe.file_stem().map(|s| s.to_string_lossy().into_owned()) else {
        return;
    };
    let mut cmd = child_command(&exe.to_string_lossy());
    cmd.arg("--version");
    let Some(current) = output_within(cmd, Duration::from_secs(5))
        .ok()
        .and_then(|o| version_of(&String::from_utf8_lossy(&o.stdout)))
    else {
        return;
    };
    let found = get(&format!(
        "https://api.github.com/search/repositories?q={stem}+in:name&per_page=10"
    ))
    .and_then(|v| {
        v.get("items")
            .and_then(Value::as_array)
            .and_then(|items| {
                items
                    .iter()
                    .filter(|r| {
                        r.get("name")
                            .and_then(Value::as_str)
                            .is_some_and(|n| n.eq_ignore_ascii_case(&stem))
                    })
                    .max_by_key(|r| r.get("stargazers_count").and_then(Value::as_u64))
                    .and_then(|r| r.get("full_name")?.as_str().map(String::from))
            })
            .ok_or_else(|| format!("{stem}: репозиторий не найден"))
    })
    .and_then(|repo| {
        get(&format!(
            "https://api.github.com/repos/{repo}/releases/latest"
        ))
    });
    match found {
        Ok(rel) => {
            let tag = rel
                .get("tag_name")
                .and_then(Value::as_str)
                .and_then(version_of);
            let url = rel
                .get("html_url")
                .and_then(Value::as_str)
                .map(String::from);
            if let Some(latest) = tag.filter(|t| t != &current) {
                out.updates.push(Update {
                    id: id.into(),
                    current,
                    latest,
                    url,
                });
            }
        }
        Err(e) => out.errors.push(e),
    }
}

fn check_own(entries: &[Entry], out: &mut Check) {
    for e in entries
        .iter()
        .filter(|e| e.item.origin == Origin::User && !e.npx)
    {
        let id = e.item.id.as_str();
        if let Some(dir) = git_dir(e) {
            check_git(id, &dir, out);
            continue;
        }
        let Some(mcp) = e.item.mcp.as_ref().filter(|_| e.item.kind == Kind::Mcp) else {
            continue;
        };
        if let Some((_, pkg, current)) = npm_pin(&mcp.args) {
            match npm_latest(&pkg) {
                Ok(latest) if latest != current => out.updates.push(Update {
                    id: id.into(),
                    current,
                    latest,
                    url: None,
                }),
                Ok(_) => {}
                Err(e) => out.errors.push(e),
            }
        } else if let Some(exe) = mcp
            .command
            .as_deref()
            .map(Path::new)
            .filter(|p| p.is_absolute() && p.is_file())
        {
            check_release(id, exe, out);
        }
    }
}

pub fn check(home: &Path, entries: &[Entry]) -> Check {
    let mut out = Check::default();
    check_plugins(home, &mut out);
    check_skills(home, &mut out);
    check_own(entries, &mut out);
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

    #[test]
    fn finds_pinned_npm_package() {
        let a = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            npm_pin(&a(&["/d", "/c", "npx", "-y", "rea-agents@6.5.0", "mcp"])),
            Some((4, "rea-agents".into(), "6.5.0".into()))
        );
        assert_eq!(
            npm_pin(&a(&["-y", "@scope/pkg@1.2.3-beta.1"])),
            Some((1, "@scope/pkg".into(), "1.2.3-beta.1".into()))
        );
        assert_eq!(npm_pin(&a(&["chrome-devtools-mcp@latest"])), None);
        assert_eq!(npm_pin(&a(&["@scope/pkg", "user@host"])), None);
    }

    #[test]
    fn reads_version_from_output() {
        assert_eq!(
            version_of("codebase-memory-mcp 0.9.0\n"),
            Some("0.9.0".into())
        );
        assert_eq!(version_of("v1.2.3"), Some("1.2.3".into()));
        assert_eq!(version_of("usage: tool [options]"), None);
    }
}
