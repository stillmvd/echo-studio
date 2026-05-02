use thiserror::Error;

#[derive(Debug, Error)]
pub enum EchoVaultError {
    #[error("EchoVault not initialized: {0} does not exist")]
    NotInitialized(String),

    #[error("Cannot resolve memory home directory")]
    UnresolvableHome,

    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("YAML parse error: {0}")]
    Yaml(#[from] serde_yaml::Error),
}

impl serde::Serialize for EchoVaultError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, EchoVaultError>;
