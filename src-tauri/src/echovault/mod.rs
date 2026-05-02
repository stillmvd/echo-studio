pub mod error;
pub mod models;
pub mod ollama;
pub mod paths;
pub mod repo;
pub mod search;

pub use error::EchoVaultError;
pub use models::{MemoriesFilter, MemoriesPage, MemoryWithBody, SearchMode, SortBy};
pub use repo::EchoVaultRepo;
