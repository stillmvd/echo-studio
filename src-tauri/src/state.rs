use std::sync::{Arc, RwLock};

use crate::echovault::{EchoVaultError, EchoVaultRepo};

pub struct AppState {
    inner: RwLock<Option<Arc<EchoVaultRepo>>>,
}

impl AppState {
    pub fn new() -> Self {
        let initial = match EchoVaultRepo::open() {
            Ok(r) => {
                eprintln!(
                    "[echo-studio] EchoVault opened: {} (source: {})",
                    r.home().to_string_lossy(),
                    r.home_source()
                );
                Some(Arc::new(r))
            }
            Err(e) => {
                eprintln!("[echo-studio] EchoVault not opened: {e}");
                None
            }
        };
        Self {
            inner: RwLock::new(initial),
        }
    }

    pub fn repo(&self) -> Result<Arc<EchoVaultRepo>, EchoVaultError> {
        self.inner
            .read()
            .expect("app state poisoned")
            .clone()
            .ok_or_else(|| {
                EchoVaultError::NotInitialized("~/.memory/index.db (or override)".into())
            })
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
