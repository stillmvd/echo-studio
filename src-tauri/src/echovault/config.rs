use std::path::Path;

use serde::{Deserialize, Serialize};

use super::paths::resolve_memory_home;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EchoVaultConfig {
    pub memory_home: String,
    pub home_source: String,
    pub embedding_provider: String,
    pub embedding_model: String,
    pub ollama_base_url: Option<String>,
    pub config_yaml_path: String,
    pub config_yaml_exists: bool,
}

#[derive(Debug, Default, Deserialize)]
struct YamlEmbedding {
    provider: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct YamlConfig {
    embedding: Option<YamlEmbedding>,
}

pub fn read_echovault_config() -> Result<EchoVaultConfig, String> {
    let (home, source) = resolve_memory_home().map_err(|e| format!("resolve memory_home: {e}"))?;
    let cfg_path = home.join("config.yaml");
    let exists = cfg_path.exists();

    let parsed: YamlConfig = if exists {
        let raw = std::fs::read_to_string(&cfg_path).map_err(|e| format!("read yaml: {e}"))?;
        serde_yaml::from_str(&raw).unwrap_or_default()
    } else {
        YamlConfig::default()
    };

    let embedding = parsed.embedding.unwrap_or_default();

    Ok(EchoVaultConfig {
        memory_home: home.to_string_lossy().into_owned(),
        home_source: source.into(),
        embedding_provider: embedding.provider.unwrap_or_else(|| "ollama".into()),
        embedding_model: embedding.model.unwrap_or_else(|| "nomic-embed-text".into()),
        ollama_base_url: embedding.base_url,
        config_yaml_path: cfg_path.to_string_lossy().into_owned(),
        config_yaml_exists: exists,
    })
}

#[allow(dead_code)]
pub fn config_yaml_path(home: &Path) -> std::path::PathBuf {
    home.join("config.yaml")
}
