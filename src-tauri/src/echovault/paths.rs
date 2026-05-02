use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::error::{EchoVaultError, Result};

const DEFAULT_HOME_DIR: &str = ".memory";
const CONFIG_REL_PATH: &str = ".config/echovault/config.yaml";

#[derive(Debug, Deserialize)]
struct GlobalConfig {
    memory_home: Option<String>,
}

fn home_dir() -> Result<PathBuf> {
    dirs::home_dir().ok_or(EchoVaultError::UnresolvableHome)
}

fn expand_tilde(raw: &str) -> Result<PathBuf> {
    let trimmed = raw.trim();
    if let Some(stripped) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        return Ok(home_dir()?.join(stripped));
    }
    if trimmed == "~" {
        return home_dir();
    }
    Ok(PathBuf::from(trimmed))
}

fn read_persisted_home() -> Result<Option<PathBuf>> {
    let cfg_path = home_dir()?.join(CONFIG_REL_PATH);
    if !cfg_path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&cfg_path)?;
    let parsed: GlobalConfig = serde_yaml::from_str(&raw)?;
    let value = parsed
        .memory_home
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    match value {
        Some(v) => Ok(Some(expand_tilde(&v)?)),
        None => Ok(None),
    }
}

pub fn resolve_memory_home() -> Result<(PathBuf, &'static str)> {
    if let Ok(env) = std::env::var("MEMORY_HOME") {
        let trimmed = env.trim();
        if !trimmed.is_empty() {
            return Ok((expand_tilde(trimmed)?, "env"));
        }
    }

    if let Some(path) = read_persisted_home()? {
        return Ok((path, "config"));
    }

    Ok((home_dir()?.join(DEFAULT_HOME_DIR), "default"))
}

pub fn index_db_path(home: &Path) -> PathBuf {
    home.join("index.db")
}

#[allow(dead_code)]
pub fn vault_root(home: &Path) -> PathBuf {
    home.join("vault")
}

#[allow(dead_code)]
pub fn backups_dir(home: &Path) -> PathBuf {
    home.join(".backups")
}
