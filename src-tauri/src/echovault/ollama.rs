use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::error::{EchoVaultError, Result};

const DEFAULT_BASE_URL: &str = "http://localhost:11434";
const DEFAULT_MODEL: &str = "nomic-embed-text";
const TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Serialize)]
struct EmbeddingsRequest<'a> {
    model: &'a str,
    prompt: &'a str,
}

#[derive(Deserialize)]
struct EmbeddingsResponse {
    embedding: Vec<f32>,
}

pub struct OllamaClient {
    base_url: String,
    model: String,
    http: reqwest::Client,
}

impl Default for OllamaClient {
    fn default() -> Self {
        Self::new(DEFAULT_BASE_URL, DEFAULT_MODEL)
    }
}

impl OllamaClient {
    pub fn new(base_url: &str, model: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .build()
            .expect("reqwest client build");
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            model: model.to_string(),
            http,
        }
    }

    pub async fn embed(&self, prompt: &str) -> Result<Vec<f32>> {
        let url = format!("{}/api/embeddings", self.base_url);
        let response = self
            .http
            .post(&url)
            .json(&EmbeddingsRequest {
                model: &self.model,
                prompt,
            })
            .send()
            .await
            .map_err(|e| EchoVaultError::OllamaUnreachable(e.to_string()))?;

        if !response.status().is_success() {
            return Err(EchoVaultError::OllamaUnreachable(format!(
                "HTTP {} from {}",
                response.status(),
                url
            )));
        }

        let body: EmbeddingsResponse = response
            .json()
            .await
            .map_err(|e| EchoVaultError::OllamaUnreachable(e.to_string()))?;

        if body.embedding.is_empty() {
            return Err(EchoVaultError::OllamaUnreachable(
                "empty embedding response".into(),
            ));
        }
        Ok(body.embedding)
    }
}

pub fn embedding_to_blob(embedding: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(embedding.len() * 4);
    for f in embedding {
        out.extend_from_slice(&f.to_le_bytes());
    }
    out
}
