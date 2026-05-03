pub mod backup;
pub mod config;
pub mod error;
pub mod models;
pub mod ollama;
pub mod paths;
pub mod repo;
pub mod search;
pub mod update;
pub mod writes;

pub use backup::BackupInfo;
pub use config::EchoVaultConfig;
pub use error::EchoVaultError;
pub use models::{MemoriesFilter, MemoriesPage, MemoryWithBody, SearchMode, SortBy};
pub use repo::EchoVaultRepo;
pub use update::MemoryPatch;
pub use writes::{BulkFailure, BulkResult};
