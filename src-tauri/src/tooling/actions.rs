use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;
use serde_json::Value;

use super::inventory::Entry;
use super::paths::{claude_dir, claude_json, installed_plugins, same_project};
use super::release::install;
use super::updates::{git_dir, npm_latest, npm_pin, release_exe};
use super::write::{backup, write_text_atomic};
use super::{Kind, Origin};
use crate::workbench::child_command;
use crate::workbench::sessions::claude_exe;

#[derive(Debug, Clone, PartialEq)]
pub enum Step {
    Trash(PathBuf),
    Run {
        program: String,
        args: Vec<String>,
        cwd: Option<PathBuf>,
    },
    DropMcp {
        file: PathBuf,
        name: String,
    },
    BumpMcp {
        name: String,
        index: usize,
        from: String,
        to: String,
    },
    ReplaceExe(PathBuf),
}

fn claude(args: &[&str], cwd: Option<&str>) -> Step {
    Step::Run {
        program: claude_exe().to_string_lossy().into_owned(),
        args: args.iter().map(|s| s.to_string()).collect(),
        cwd: cwd.map(PathBuf::from),
    }
}

fn npx_skills(args: &[&str]) -> Step {
    Step::Run {
        program: "npx.cmd".into(),
        args: ["-y", "skills"]
            .iter()
            .chain(args)
            .map(|s| s.to_string())
            .collect(),
        cwd: None,
    }
}

fn skill_dir(file: &str) -> PathBuf {
    Path::new(file)
        .parent()
        .map_or_else(|| PathBuf::from(file), Path::to_path_buf)
}

fn trash_of(kind: Kind, file: &str) -> Step {
    Step::Trash(if kind == Kind::Skill {
        skill_dir(file)
    } else {
        PathBuf::from(file)
    })
}

fn safe(name: &str) -> Result<&str, String> {
    let ok = !name.is_empty()
        && !name.starts_with('-')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.:@".contains(c));
    if ok {
        Ok(name)
    } else {
        Err(format!("Имя «{name}» нельзя передать в командную строку"))
    }
}

pub fn plan_delete(e: &Entry, projects: &[String]) -> Result<Vec<Step>, String> {
    let item = &e.item;
    let name = item.name.as_str();
    if item.kind == Kind::Plugin || item.kind == Kind::Mcp || e.npx {
        safe(name)?;
        safe(&item.qualified_name)?;
    }
    if item.origin == Origin::Plugin && item.kind != Kind::Plugin {
        return Err(format!(
            "{name} — часть plugin, удаляется только plugin целиком"
        ));
    }
    if !e.copies.is_empty() {
        let picked: Vec<_> = e
            .copies
            .iter()
            .filter(|c| projects.iter().any(|p| same_project(p, &c.path)))
            .collect();
        if picked.is_empty() {
            return Err("Не выбраны проекты".into());
        }
        return picked
            .into_iter()
            .map(|c| {
                let file = c
                    .file
                    .as_deref()
                    .ok_or_else(|| format!("Нет пути у {name} в {}", c.project))?;
                Ok(match item.kind {
                    Kind::Mcp if file.ends_with(".mcp.json") => Step::DropMcp {
                        file: file.into(),
                        name: name.into(),
                    },
                    Kind::Mcp => claude(&["mcp", "remove", name, "-s", "local"], Some(&c.path)),
                    k => trash_of(k, file),
                })
            })
            .collect();
    }
    let file = item.file_path.as_deref();
    Ok(vec![match item.kind {
        Kind::Plugin => claude(
            &[
                "plugin",
                "uninstall",
                &item.qualified_name,
                "-s",
                "user",
                "-y",
            ],
            None,
        ),
        Kind::Mcp => claude(&["mcp", "remove", name, "-s", "user"], None),
        Kind::Skill if e.npx => npx_skills(&["remove", name, "-g", "-y"]),
        k => trash_of(k, file.ok_or_else(|| format!("Нет пути у {name}"))?),
    }])
}

pub fn plan_update(e: &Entry, home: &Path) -> Result<Step, String> {
    safe(&e.item.qualified_name)?;
    match (e.item.kind, e.item.origin) {
        (Kind::Plugin, _) => Ok(claude(
            &[
                "plugin",
                "update",
                &e.item.qualified_name,
                "-s",
                "user",
                "-y",
            ],
            None,
        )),
        (Kind::Skill, Origin::User) if e.npx => {
            Ok(npx_skills(&["update", &e.item.name, "-g", "-y"]))
        }
        (Kind::Skill | Kind::Mcp, Origin::User) if git_dir(e).is_some() => Ok(Step::Run {
            program: "git".into(),
            args: vec!["pull".into(), "--ff-only".into()],
            cwd: git_dir(e),
        }),
        (Kind::Mcp, Origin::User) => {
            let args = e
                .item
                .mcp
                .as_ref()
                .map(|m| m.args.as_slice())
                .unwrap_or_default();
            let Some((index, pkg, current)) = npm_pin(args) else {
                return release_exe(home, e)
                    .map(Step::ReplaceExe)
                    .ok_or_else(|| format!("{} обновляется вручную", e.item.name));
            };
            Ok(Step::BumpMcp {
                name: e.item.name.clone(),
                index,
                to: format!("{pkg}@{}", npm_latest(&pkg)?),
                from: format!("{pkg}@{current}"),
            })
        }
        _ => Err(format!("{} не обновляется из Echo", e.item.name)),
    }
}

pub fn bump_mcp(
    text: &str,
    name: &str,
    index: usize,
    from: &str,
    to: &str,
) -> Result<String, String> {
    let mut v: Value =
        serde_json::from_str(text).map_err(|e| format!("Битый ~/.claude.json: {e}"))?;
    let arg = v
        .pointer_mut(&format!(
            "/mcpServers/{}/args/{index}",
            name.replace('~', "~0").replace('/', "~1")
        ))
        .filter(|a| a.as_str() == Some(from))
        .ok_or_else(|| format!("{name}: настройка изменилась, проверь обновления заново"))?;
    *arg = Value::String(to.into());
    serde_json::to_string_pretty(&v).map_err(|e| e.to_string())
}

pub fn delete_roots(home: &Path, projects: &[String]) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = ["skills", "commands", "agents"]
        .iter()
        .map(|k| claude_dir(home).join(k))
        .collect();
    roots.push(home.join(".agents").join("skills"));
    for p in projects {
        for k in ["skills", "commands", "agents"] {
            roots.push(Path::new(p).join(".claude").join(k));
        }
    }
    roots
}

fn plain(p: PathBuf) -> PathBuf {
    match p.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
        _ => p,
    }
}

pub fn check_trash(path: &Path, roots: &[PathBuf]) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .and_then(|p| p.canonicalize().ok())
        .ok_or_else(|| format!("Не найдено: {}", path.display()))?;
    let name = path.file_name().filter(|n| *n != ".." && *n != ".");
    let inside = roots
        .iter()
        .filter_map(|r| r.canonicalize().ok())
        .any(|r| parent.starts_with(&r));
    if let (Some(name), true, true) = (name, inside, fs::symlink_metadata(path).is_ok()) {
        Ok(plain(parent.join(name)))
    } else {
        Err(format!(
            "Удалять можно только инструменты: {}",
            path.display()
        ))
    }
}

pub fn check_mcp_json(file: &Path, projects: &[String]) -> Result<(), String> {
    let ok = file.file_name().is_some_and(|n| n == ".mcp.json")
        && file.parent().is_some_and(|dir| {
            projects
                .iter()
                .any(|p| same_project(p, &dir.to_string_lossy()))
        });
    if ok {
        Ok(())
    } else {
        Err(format!(
            "Не .mcp.json известного проекта: {}",
            file.display()
        ))
    }
}

pub fn drop_mcp(text: &str, name: &str) -> Result<String, String> {
    let mut v: Value = serde_json::from_str(text).map_err(|e| format!("Битый .mcp.json: {e}"))?;
    let removed = v
        .get_mut("mcpServers")
        .and_then(Value::as_object_mut)
        .and_then(|m| m.shift_remove(name));
    if removed.is_none() {
        return Err(format!("{name} нет в .mcp.json"));
    }
    let indent: String = text
        .lines()
        .nth(1)
        .map(|l| l.chars().take_while(|c| *c == ' ' || *c == '\t').collect())
        .filter(|s: &String| !s.is_empty())
        .unwrap_or_else(|| "  ".into());
    let mut out = Vec::new();
    let fmt = serde_json::ser::PrettyFormatter::with_indent(indent.as_bytes());
    serde::Serialize::serialize(
        &v,
        &mut serde_json::Serializer::with_formatter(&mut out, fmt),
    )
    .map_err(|e| e.to_string())?;
    let mut s = String::from_utf8(out).map_err(|e| e.to_string())?;
    if text.ends_with('\n') {
        s.push('\n');
    }
    Ok(if text.contains("\r\n") {
        s.replace('\n', "\r\n")
    } else {
        s
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Done {
    pub trashed: usize,
}

fn config_files(home: &Path) -> Vec<PathBuf> {
    vec![
        claude_json(home),
        claude_dir(home).join("settings.json"),
        installed_plugins(home),
        home.join(".agents").join(".skill-lock.json"),
    ]
}

fn tail(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(4)..].join("\n")
}

pub fn output_within(mut cmd: Command, limit: Duration) -> Result<Output, String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let read = |pipe: Option<Box<dyn Read + Send>>| {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            if let Some(mut p) = pipe {
                let _ = p.read_to_end(&mut buf);
            }
            let _ = tx.send(buf);
        });
        rx
    };
    let out = read(
        child
            .stdout
            .take()
            .map(|p| Box::new(p) as Box<dyn Read + Send>),
    );
    let err = read(
        child
            .stderr
            .take()
            .map(|p| Box::new(p) as Box<dyn Read + Send>),
    );
    let deadline = Instant::now() + limit;
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        if Instant::now() >= deadline {
            let _ = child_command("taskkill")
                .args(["/PID", &child.id().to_string(), "/T", "/F"])
                .status();
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("не ответила за {} с", limit.as_secs()));
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let grace = Instant::now() + Duration::from_secs(2);
    let take = |rx: std::sync::mpsc::Receiver<Vec<u8>>| {
        rx.recv_timeout(grace.saturating_duration_since(Instant::now()))
            .unwrap_or_default()
    };
    Ok(Output {
        status,
        stdout: take(out),
        stderr: take(err),
    })
}

fn run(program: &str, args: &[String], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd: Command = child_command(program);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let out =
        output_within(cmd, Duration::from_secs(180)).map_err(|e| format!("{program}: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        let err = tail(&out.stderr);
        Err(if err.is_empty() {
            tail(&out.stdout)
        } else {
            err
        })
    }
}

pub fn execute(
    steps: &[Step],
    home: &Path,
    backups: &Path,
    projects: &[String],
) -> Result<Done, String> {
    let roots = delete_roots(home, projects);
    for s in steps {
        match s {
            Step::Trash(p) => {
                check_trash(p, &roots)?;
            }
            Step::DropMcp { file, .. } => check_mcp_json(file, projects)?,
            Step::Run { .. } | Step::BumpMcp { .. } | Step::ReplaceExe(_) => {}
        }
    }
    let now = SystemTime::now();
    if steps.iter().any(|s| matches!(s, Step::Run { .. })) {
        for f in config_files(home).iter().filter(|f| f.is_file()) {
            backup(f, backups, now)?;
        }
    }
    let mut done = Done { trashed: 0 };
    for (i, s) in steps.iter().enumerate() {
        let step = || -> Result<(), String> {
            match s {
                Step::Trash(p) => to_trash(&check_trash(p, &roots)?),
                Step::DropMcp { file, name } => {
                    let text =
                        fs::read_to_string(file).map_err(|e| format!("{}: {e}", file.display()))?;
                    let next = drop_mcp(&text, name)?;
                    backup(file, backups, now)?;
                    write_text_atomic(file, &next)
                }
                Step::BumpMcp {
                    name,
                    index,
                    from,
                    to,
                } => {
                    let file = claude_json(home);
                    backup(&file, backups, now)?;
                    let text = fs::read_to_string(&file)
                        .map_err(|e| format!("{}: {e}", file.display()))?;
                    write_text_atomic(&file, &bump_mcp(&text, name, *index, from, to)?)
                }
                Step::Run { program, args, cwd } => run(program, args, cwd.as_deref()).map(|_| ()),
                Step::ReplaceExe(exe) => install(exe).map(|_| ()),
            }
        };
        match step() {
            Ok(()) if matches!(s, Step::Trash(_)) => done.trashed += 1,
            Ok(()) => {}
            Err(e) if i > 0 => {
                return Err(format!("{e}. До ошибки выполнено {i} из {}", steps.len()))
            }
            Err(e) => return Err(e),
        }
    }
    Ok(done)
}

#[cfg(windows)]
fn to_trash(path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT,
        FOF_WANTNUKEWARNING, FO_DELETE, SHFILEOPSTRUCTW,
    };
    let from: Vec<u16> = path.as_os_str().encode_wide().chain([0, 0]).collect();
    let mut op: SHFILEOPSTRUCTW = unsafe { std::mem::zeroed() };
    op.wFunc = FO_DELETE;
    op.pFrom = from.as_ptr();
    op.fFlags =
        (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT | FOF_WANTNUKEWARNING)
            as u16;
    let code = unsafe { SHFileOperationW(&mut op) };
    if code == 0 && op.fAnyOperationsAborted == 0 && fs::symlink_metadata(path).is_err() {
        Ok(())
    } else {
        Err(format!(
            "Не удалось убрать в Корзину {} (код {code})",
            path.display()
        ))
    }
}

#[cfg(not(windows))]
fn to_trash(path: &Path) -> Result<(), String> {
    Err(format!("Корзина только в Windows: {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tooling::inventory::Copy;
    use crate::tooling::ToolItem;

    fn entry(kind: Kind, origin: Origin, name: &str, file: Option<&str>) -> Entry {
        let mut item = ToolItem::new(kind, origin, name.into(), name.into());
        item.file_path = file.map(String::from);
        Entry {
            item,
            copies: vec![],
            project_off: vec![],
            installed: None,
            npx: false,
        }
    }

    #[test]
    fn plans_delete_by_kind() {
        let skill = entry(
            Kind::Skill,
            Origin::User,
            "jira",
            Some("C:\\h\\.claude\\skills\\jira\\SKILL.md"),
        );
        assert_eq!(
            plan_delete(&skill, &[]).unwrap(),
            vec![Step::Trash("C:\\h\\.claude\\skills\\jira".into())]
        );
        let cmd = entry(
            Kind::Command,
            Origin::User,
            "book",
            Some("C:\\h\\.claude\\commands\\book.md"),
        );
        assert_eq!(
            plan_delete(&cmd, &[]).unwrap(),
            vec![Step::Trash("C:\\h\\.claude\\commands\\book.md".into())]
        );
        let mut npx = entry(Kind::Skill, Origin::User, "media-use", Some("x"));
        npx.npx = true;
        assert!(
            matches!(&plan_delete(&npx, &[]).unwrap()[0], Step::Run { program, args, .. } if program == "npx.cmd" && args.contains(&"remove".to_string()))
        );
        let mut plugin = entry(Kind::Plugin, Origin::Plugin, "pony", None);
        plugin.item.qualified_name = "pony@m".into();
        assert!(
            matches!(&plan_delete(&plugin, &[]).unwrap()[0], Step::Run { args, .. } if args[..3] == ["plugin", "uninstall", "pony@m"])
        );
        let child = entry(Kind::Skill, Origin::Plugin, "review", Some("x"));
        assert!(plan_delete(&child, &[]).is_err());
    }

    #[test]
    fn plans_project_copies_only_for_picked_projects() {
        let mut mcp = entry(Kind::Mcp, Origin::Project, "chrome-devtools", None);
        let copy = |p: &str, f: &str| Copy {
            project: p.into(),
            path: format!("C:\\P\\{p}"),
            file: Some(f.into()),
        };
        mcp.copies = vec![
            copy("A", "C:\\P\\A\\.mcp.json"),
            copy("B", "C:\\h\\.claude.json"),
            copy("C", "C:\\P\\C\\.mcp.json"),
        ];
        let steps = plan_delete(&mcp, &["C:\\P\\A".into(), "c:/p/b".into()]).unwrap();
        assert_eq!(steps.len(), 2);
        assert_eq!(
            steps[0],
            Step::DropMcp {
                file: "C:\\P\\A\\.mcp.json".into(),
                name: "chrome-devtools".into()
            }
        );
        assert!(
            matches!(&steps[1], Step::Run { args, cwd, .. } if args.contains(&"local".to_string()) && cwd.as_deref() == Some(Path::new("C:\\P\\B")))
        );
        assert!(plan_delete(&mcp, &[]).is_err());
    }

    #[test]
    fn drops_one_mcp_key_keeping_order() {
        let text = r#"{"mcpServers":{"a":{"command":"x"},"chrome-devtools":{"command":"npx"},"b":{}},"other":1}"#;
        let out = drop_mcp(text, "chrome-devtools").unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(
            v["mcpServers"]
                .as_object()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
            ["a", "b"]
        );
        assert_eq!(v["other"], 1);
        assert!(out.starts_with("{\n  \"mcpServers\""));
        assert!(drop_mcp(text, "nope").is_err());
        let four = "{\r\n    \"mcpServers\": {\r\n        \"a\": {},\r\n        \"b\": {}\r\n    }\r\n}\r\n";
        assert_eq!(
            drop_mcp(four, "b").unwrap(),
            "{\r\n    \"mcpServers\": {\r\n        \"a\": {}\r\n    }\r\n}\r\n"
        );
    }

    #[test]
    fn refuses_names_unsafe_for_the_command_line() {
        assert!(safe("chrome-devtools").is_ok());
        assert!(safe("ponytail@ponytail").is_ok());
        assert!(safe("-s").is_err());
        assert!(safe("a&b").is_err());
        assert!(safe("a b").is_err());
        let mut mcp = entry(Kind::Mcp, Origin::User, "--all", None);
        mcp.item.qualified_name = "--all".into();
        assert!(plan_delete(&mcp, &[]).is_err());
    }

    #[test]
    fn trash_only_inside_tool_dirs() {
        let home = tempfile::tempdir().unwrap();
        let h = home.path();
        let skill = h.join(".claude/skills/jira");
        fs::create_dir_all(&skill).unwrap();
        fs::write(h.join(".claude/settings.json"), "{}").unwrap();
        let proj = h.join("P");
        fs::create_dir_all(proj.join(".claude/commands")).unwrap();
        fs::write(proj.join(".claude/commands/x.md"), "x").unwrap();
        let roots = delete_roots(h, &[proj.to_string_lossy().into_owned()]);
        assert!(check_trash(&skill, &roots).is_ok());
        assert!(check_trash(&proj.join(".claude/commands/x.md"), &roots).is_ok());
        assert!(check_trash(&h.join(".claude/skills"), &roots).is_err());
        assert!(check_trash(&h.join(".claude/settings.json"), &roots).is_err());
        assert!(check_trash(&proj.join(".claude"), &roots).is_err());
        assert!(check_trash(&h.join(".claude/skills/../settings.json"), &roots).is_err());
        assert!(check_trash(&h.join(".claude/skills/missing"), &roots).is_err());
        assert!(check_mcp_json(
            &proj.join(".mcp.json"),
            &[proj.to_string_lossy().into_owned()]
        )
        .is_ok());
        assert!(
            check_mcp_json(&h.join(".mcp.json"), &[proj.to_string_lossy().into_owned()]).is_err()
        );
    }

    #[test]
    fn bumps_pinned_mcp_version_only() {
        let text = r#"{"numStartups":3,"mcpServers":{"rea":{"command":"cmd.exe","args":["/c","npx","rea-agents@6.5.0","mcp"]}},"z":1}"#;
        let next = bump_mcp(text, "rea", 2, "rea-agents@6.5.0", "rea-agents@6.8.0").unwrap();
        let v: Value = serde_json::from_str(&next).unwrap();
        assert_eq!(v["mcpServers"]["rea"]["args"][2], "rea-agents@6.8.0");
        assert_eq!(v["numStartups"], 3);
        assert!(next.find("numStartups") < next.find("\"z\""));
        assert!(bump_mcp(text, "rea", 2, "rea-agents@6.4.0", "x").is_err());
        assert!(bump_mcp(text, "other", 2, "rea-agents@6.5.0", "x").is_err());
    }
}
