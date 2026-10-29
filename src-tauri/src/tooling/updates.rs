use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use super::actions::output_within;
use super::inventory::Entry;
use super::paths::{claude_dir, installed_plugins};
use super::release::{arch, pick_asset};
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

fn known_markets(home: &Path) -> Value {
    json(
        &claude_dir(home)
            .join("plugins")
            .join("known_marketplaces.json"),
    )
    .unwrap_or_default()
}

fn remote_markets(markets: &Value) -> Vec<String> {
    markets
        .as_object()
        .map(|m| {
            m.iter()
                .filter(|(_, v)| {
                    v.pointer("/source/source").and_then(Value::as_str) != Some("directory")
                })
                .map(|(k, _)| k.clone())
                .collect()
        })
        .unwrap_or_default()
}

fn check_plugins(home: &Path, names: &[String], tick: &dyn Fn(), out: &mut Check) {
    let claude = claude_exe().to_string_lossy().into_owned();
    for name in names {
        if let Err(e) = output(&claude, &["plugin", "marketplace", "update", name], None) {
            out.errors.push(format!("{name}: {e}"));
        }
        tick();
    }
    let markets = known_markets(home);
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

type Skill = (String, String, String);
type SkillGroups = BTreeMap<(String, String), Vec<Skill>>;

fn skill_groups(home: &Path) -> SkillGroups {
    let lock = json(&home.join(".agents").join(".skill-lock.json")).unwrap_or_default();
    let mut groups = SkillGroups::new();
    let Some(skills) = lock.get("skills").and_then(Value::as_object) else {
        return groups;
    };
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
    groups
}

fn check_group(repo: &str, parent: &str, list: Vec<Skill>, out: &mut Check) {
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

fn semver(v: &str) -> Option<(u64, u64, u64)> {
    let core = v.trim_start_matches('v').split(['-', '+']).next()?;
    let mut parts = core.split('.').map(|p| p.parse::<u64>().ok());
    let out = (
        parts.next()??,
        parts.next()??,
        parts.next().flatten().unwrap_or(0),
    );
    parts.next().is_none().then_some(out)
}

pub fn newer(latest: &str, current: &str) -> bool {
    matches!((semver(latest), semver(current)), (Some(l), Some(c)) if l > c)
}

fn npm_name(pkg: &str) -> bool {
    let plain = |s: &str| {
        !s.is_empty()
            && s.starts_with(|c: char| c.is_ascii_alphanumeric())
            && s.chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "._-".contains(c))
    };
    match pkg.strip_prefix('@') {
        Some(scoped) => scoped
            .split_once('/')
            .is_some_and(|(scope, name)| plain(scope) && plain(name)),
        None => plain(pkg),
    }
}

pub fn npm_pin(args: &[String]) -> Option<(usize, String, String)> {
    args.iter().enumerate().find_map(|(i, a)| {
        let (pkg, ver) = a.rsplit_once('@')?;
        let core = ver.split(['-', '+']).next().unwrap_or_default();
        let ok = npm_name(pkg)
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
        Kind::Mcp => {
            let args = &e.item.mcp.as_ref()?.args;
            let at = args.iter().position(|a| a == "--directory")?;
            PathBuf::from(args.get(at + 1)?)
        }
        _ => return None,
    };
    (dir.is_absolute() && dir.join(".git").exists()).then_some(dir)
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
        .map(|t| {
            t.trim_start_matches('v')
                .trim_end_matches(|c: char| !c.is_ascii_alphanumeric())
        })
        .find(|t| semver(t).is_some())
        .map(String::from)
}

pub fn exe_stem(exe: &Path) -> Option<String> {
    exe.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| {
            !s.is_empty()
                && s.chars()
                    .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
        })
}

pub fn release_exe(home: &Path, e: &Entry) -> Option<PathBuf> {
    e.item
        .mcp
        .as_ref()
        .filter(|_| e.item.kind == Kind::Mcp && e.item.origin == Origin::User && !e.npx)
        .and_then(|m| m.command.as_deref())
        .map(PathBuf::from)
        .filter(|p| p.starts_with(home) && p.is_file())
}

pub fn find_release(stem: &str) -> Result<Value, String> {
    get(&format!(
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
                            .is_some_and(|n| n.eq_ignore_ascii_case(stem))
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
    })
}

fn check_release(id: &str, exe: &Path, out: &mut Check) {
    let Some(stem) = exe_stem(exe) else {
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
    match find_release(&stem) {
        Ok(rel) => {
            let tag = rel
                .get("tag_name")
                .and_then(Value::as_str)
                .and_then(version_of);
            let url = if pick_asset(&rel, &stem, arch()).is_some() {
                None
            } else {
                rel.get("html_url")
                    .and_then(Value::as_str)
                    .map(String::from)
            };
            if let Some(latest) = tag.filter(|t| newer(t, &current)) {
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

enum Own {
    Npm(String, String),
    Git(PathBuf),
    Release(PathBuf),
}

fn own_source(home: &Path, e: &Entry) -> Option<Own> {
    if e.item.origin != Origin::User || e.npx {
        return None;
    }
    let mcp = e.item.mcp.as_ref().filter(|_| e.item.kind == Kind::Mcp);
    if let Some((_, pkg, current)) = mcp.and_then(|m| npm_pin(&m.args)) {
        return Some(Own::Npm(pkg, current));
    }
    if let Some(dir) = git_dir(e) {
        return Some(Own::Git(dir));
    }
    release_exe(home, e).map(Own::Release)
}

fn check_own(id: &str, source: Own, out: &mut Check) {
    match source {
        Own::Npm(pkg, current) => match npm_latest(&pkg) {
            Ok(latest) if newer(&latest, &current) => out.updates.push(Update {
                id: id.into(),
                current,
                latest,
                url: None,
            }),
            Ok(_) => {}
            Err(e) => out.errors.push(e),
        },
        Own::Git(dir) => check_git(id, &dir, out),
        Own::Release(exe) => check_release(id, &exe, out),
    }
}

pub fn check(home: &Path, entries: &[Entry], progress: impl Fn(usize, usize) + Sync) -> Check {
    let groups = skill_groups(home);
    let own: Vec<_> = entries
        .iter()
        .filter_map(|e| own_source(home, e).map(|s| (e.item.id.clone(), s)))
        .collect();
    let names = remote_markets(&known_markets(home));
    let total = names.len() + groups.len() + own.len();
    let done = AtomicUsize::new(0);
    progress(0, total);
    let tick = || progress(done.fetch_add(1, Ordering::SeqCst) + 1, total);
    let tick = &tick;
    let parts: Vec<Check> = thread::scope(|s| {
        let mut jobs = vec![s.spawn(move || {
            let mut c = Check::default();
            check_plugins(home, &names, tick, &mut c);
            c
        })];
        for ((repo, parent), list) in groups {
            jobs.push(s.spawn(move || {
                let mut c = Check::default();
                check_group(&repo, &parent, list, &mut c);
                tick();
                c
            }));
        }
        for (id, source) in own {
            jobs.push(s.spawn(move || {
                let mut c = Check::default();
                check_own(&id, source, &mut c);
                tick();
                c
            }));
        }
        jobs.into_iter()
            .map(|j| j.join().unwrap_or_default())
            .collect()
    });
    let mut out = Check::default();
    for c in parts {
        out.updates.extend(c.updates);
        out.errors.extend(c.errors);
    }
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
    fn skips_directory_marketplaces() {
        let markets: Value = serde_json::from_str(
            r#"{"a":{"source":{"source":"github"}},"b":{"source":{"source":"directory"}},"c":{}}"#,
        )
        .unwrap();
        assert_eq!(remote_markets(&markets), vec!["a", "c"]);
        assert!(remote_markets(&Value::Null).is_empty());
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
        assert_eq!(
            version_of("Microsoft Windows [Version 10.0.26200.1234]"),
            None
        );
    }

    #[test]
    fn only_newer_versions_count() {
        assert!(newer("6.8.0", "6.5.0"));
        assert!(newer("v0.12.1", "0.9.0"));
        assert!(!newer("1.2.3", "1.2.3"));
        assert!(!newer("1.2.2", "1.3.0-beta.1"));
        assert!(!newer("latest", "1.0.0"));
    }

    #[test]
    fn rejects_paths_and_flags_as_npm_pins() {
        let a = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(npm_pin(&a(&[r"C:\x@1.0.0\run.js"])), None);
        assert_eq!(npm_pin(&a(&["--flag=a@1.2.3"])), None);
        assert_eq!(npm_pin(&a(&["Upper@1.2.3"])), None);
    }
}
