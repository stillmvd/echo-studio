use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;
use sha2::{Digest, Sha256};

use super::actions::output_within;
use super::updates::{exe_stem, find_release, version_of};
use crate::workbench::child_command;

pub fn arch() -> &'static [&'static str] {
    match std::env::consts::ARCH {
        "aarch64" => &["arm64", "aarch64"],
        _ => &["amd64", "x86_64", "x64", "win64"],
    }
}

fn words(name: &str) -> Vec<String> {
    name.to_ascii_lowercase()
        .split(['-', '_', '.'])
        .map(String::from)
        .collect()
}

pub fn pick_asset<'a>(rel: &'a Value, stem: &str, arch: &[&str]) -> Option<(&'a str, &'a str)> {
    let mut found: Vec<(&str, &str)> = rel
        .get("assets")?
        .as_array()?
        .iter()
        .filter_map(|a| {
            Some((
                a.get("name")?.as_str()?,
                a.get("browser_download_url")?.as_str()?,
            ))
        })
        .filter(|(name, _)| {
            let lower = name.to_ascii_lowercase();
            let w = words(name);
            (lower.ends_with(".zip") || lower.ends_with(".exe"))
                && w.iter()
                    .any(|t| t == "windows" || t == "win" || t == "win64")
                && w.iter().any(|t| arch.contains(&t.as_str()))
        })
        .collect();
    let own = format!("{}-windows", stem.to_ascii_lowercase());
    found.sort_by_key(|(name, _)| (!name.to_ascii_lowercase().starts_with(&own), name.len()));
    found.into_iter().next()
}

pub fn checksums_asset(rel: &Value) -> Option<&str> {
    rel.get("assets")?.as_array()?.iter().find_map(|a| {
        let name = a.get("name")?.as_str()?.to_ascii_lowercase();
        (name == "checksums.txt" || name == "sha256sums" || name == "sha256sums.txt")
            .then(|| a.get("browser_download_url")?.as_str())
            .flatten()
    })
}

pub fn expected_sha(checksums: &str, asset: &str) -> Option<String> {
    checksums.lines().find_map(|l| {
        let mut parts = l.split_whitespace();
        let hash = parts.next()?;
        let name = parts.next()?.trim_start_matches('*');
        (name == asset && hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()))
            .then(|| hash.to_ascii_lowercase())
    })
}

fn sha256(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(format!("{:x}", Sha256::digest(&bytes)))
}

fn download(url: &str, to: &Path) -> Result<(), String> {
    let mut cmd = child_command("curl.exe");
    cmd.args([
        "-sSfL",
        "--max-time",
        "900",
        "-H",
        "User-Agent: echo-studio",
        "-o",
    ])
    .arg(to)
    .arg(url);
    let out = output_within(cmd, Duration::from_secs(960))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Не удалось скачать {url}: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

fn find_file(dir: &Path, name: &str) -> Option<PathBuf> {
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_file(&path, name) {
                return Some(found);
            }
        } else if path
            .file_name()
            .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(name))
        {
            return Some(path);
        }
    }
    None
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut s = OsString::from(path.as_os_str());
    s.push(suffix);
    s.into()
}

pub fn replace(exe: &Path, new: &Path) -> Result<PathBuf, String> {
    let staged = sibling(exe, ".echo-new");
    fs::copy(new, &staged).map_err(|e| format!("{}: {e}", staged.display()))?;
    let mut bak = sibling(exe, ".echo-bak");
    if bak.exists() && fs::remove_file(&bak).is_err() {
        let secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or_default();
        bak = sibling(exe, &format!(".echo-bak-{secs}"));
    }
    if let Err(e) = fs::rename(exe, &bak) {
        let _ = fs::remove_file(&staged);
        return Err(format!("{}: {e}", exe.display()));
    }
    if let Err(e) = fs::rename(&staged, exe) {
        let _ = fs::rename(&bak, exe);
        let _ = fs::remove_file(&staged);
        return Err(format!("{}: {e}", exe.display()));
    }
    Ok(bak)
}

fn fetch(exe: &Path, stem: &str, work: &Path) -> Result<String, String> {
    let rel = find_release(stem)?;
    let latest = rel
        .get("tag_name")
        .and_then(Value::as_str)
        .and_then(version_of)
        .ok_or_else(|| format!("{stem}: у релиза нет версии"))?;
    let (asset, url) = pick_asset(&rel, stem, arch())
        .ok_or_else(|| format!("{stem}: в релизе нет сборки для Windows"))?;
    let file = work.join(asset);
    download(url, &file)?;
    if let Some(sums) = checksums_asset(&rel) {
        let list = work.join("checksums.txt");
        download(sums, &list)?;
        let text = fs::read_to_string(&list).unwrap_or_default();
        if let Some(want) = expected_sha(&text, asset) {
            if sha256(&file)? != want {
                return Err(format!("{asset}: контрольная сумма не совпала"));
            }
        }
    }
    let name = format!("{stem}.exe");
    let new = if asset.to_ascii_lowercase().ends_with(".zip") {
        let out = work.join("x");
        fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        let system = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
        let mut cmd = child_command(
            &Path::new(&system)
                .join("System32")
                .join("tar.exe")
                .to_string_lossy(),
        );
        cmd.arg("-xf").arg(&file).arg("-C").arg(&out);
        let res = output_within(cmd, Duration::from_secs(300))?;
        if !res.status.success() {
            return Err(format!(
                "{asset}: не удалось распаковать: {}",
                String::from_utf8_lossy(&res.stderr).trim()
            ));
        }
        find_file(&out, &name).ok_or_else(|| format!("{asset}: внутри нет {name}"))?
    } else {
        file
    };
    let mut cmd = child_command(&new.to_string_lossy());
    cmd.arg("--version");
    let got = output_within(cmd, Duration::from_secs(10))
        .ok()
        .and_then(|o| version_of(&String::from_utf8_lossy(&o.stdout)));
    if got.as_deref() != Some(latest.as_str()) {
        return Err(format!(
            "{name}: новая сборка сообщает версию {}, ждали {latest}",
            got.unwrap_or_else(|| "?".into())
        ));
    }
    replace(exe, &new)?;
    Ok(latest)
}

pub fn install(exe: &Path) -> Result<String, String> {
    let stem = exe_stem(exe).ok_or_else(|| format!("{}: имя exe не подходит", exe.display()))?;
    let work = std::env::temp_dir().join(format!("echo-exe-{stem}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| format!("{}: {e}", work.display()))?;
    let result = fetch(exe, &stem, &work);
    let _ = fs::remove_dir_all(&work);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rel(names: &[&str]) -> Value {
        Value::Array(
            names
                .iter()
                .map(|n| serde_json::json!({ "name": n, "browser_download_url": format!("https://x/{n}") }))
                .collect(),
        )
    }

    #[test]
    fn picks_windows_build_for_arch() {
        let r = serde_json::json!({ "assets": rel(&[
            "tool-darwin-amd64.tar.gz",
            "tool-ui-windows-amd64.zip",
            "tool-windows-amd64.zip.bundle",
            "tool-windows-amd64.mcpb",
            "tool-windows-arm64.zip",
            "tool-windows-amd64.zip",
        ]) });
        assert_eq!(
            pick_asset(&r, "tool", &["amd64"]).map(|a| a.0),
            Some("tool-windows-amd64.zip")
        );
        assert_eq!(
            pick_asset(&r, "tool", &["arm64"]).map(|a| a.0),
            Some("tool-windows-arm64.zip")
        );
        let darwin = serde_json::json!({ "assets": rel(&["tool-darwin-amd64.zip"]) });
        assert_eq!(pick_asset(&darwin, "tool", &["amd64"]), None);
    }

    #[test]
    fn reads_checksum_line() {
        let h = "a".repeat(64);
        let text = format!(
            "{h}  tool-windows-amd64.zip\n{}  other.zip\n",
            "b".repeat(64)
        );
        assert_eq!(expected_sha(&text, "tool-windows-amd64.zip"), Some(h));
        assert_eq!(expected_sha(&text, "missing.zip"), None);
        assert_eq!(expected_sha("zz  tool.zip", "tool.zip"), None);
    }

    #[test]
    fn replaces_exe_and_keeps_backup() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("tool.exe");
        let new = dir.path().join("new.exe");
        fs::write(&exe, "old").unwrap();
        fs::write(&new, "new").unwrap();
        let bak = replace(&exe, &new).unwrap();
        assert_eq!(fs::read_to_string(&exe).unwrap(), "new");
        assert_eq!(fs::read_to_string(&bak).unwrap(), "old");
        fs::write(&new, "newer").unwrap();
        let bak = replace(&exe, &new).unwrap();
        assert_eq!(fs::read_to_string(&exe).unwrap(), "newer");
        assert_eq!(fs::read_to_string(bak).unwrap(), "new");
        assert!(!sibling(&exe, ".echo-new").exists());
    }
}
