# Phase 1 — EchoVault Read-Repo

## Goal

Rust-слой `echovault::repo` для чтения `~/.memory/index.db` через rusqlite + Tauri IPC commands `list_memories` / `get_memory` с типизированными моделями, синхронизированными со схемой EchoVault v0.4.0. Frontend поднимает TanStack Query и через `useMemoriesList()` показывает реальные счётчики проектов и заголовки первых N memories — доказательство сквозного IPC.

## Definition of Done

- [ ] Rust-команды: `list_memories(filter)`, `get_memory(id)` зарегистрированы и вызываемы из JS
- [ ] Модели сериализуются в camelCase JSON, поля совпадают со схемой DB
- [ ] `tags`, `related_files` парсятся из JSON-array TEXT
- [ ] `resolve_memory_home()` поддерживает: env `MEMORY_HOME` → `~/.config/echovault/config.yaml` (key `memory_home`) → `~/.memory`
- [ ] Frontend: TanStack Query настроен, `App.tsx` показывает `total` + список первых 10 memories из реальной БД owner'а
- [ ] Golden test читает `~/.memory/index.db` и проверяет: total > 0, get_memory возвращает body
- [ ] Все pre-commit-проверки зелёные

## Закрывает требования

— Никакие FR не «closes» полностью (это repo-слой, UI-слой будет в Phase 2). Создаёт фундамент для FR-MEM-01..03.

## Tasks

### T-1.1 — Cargo deps
```toml
rusqlite = { version = "0.32", features = ["bundled"] }
dirs = "5"
chrono = { version = "0.4", features = ["serde"] }
serde_yaml = "0.9"
```

Sqlite-vec НЕ добавляем (semantic-search в Phase 3). FTS5 уже внутри bundled-sqlite.

### T-1.2 — Models (`src-tauri/src/echovault/models.rs`)

```rust
pub struct Memory {
    id, title, what, why?, impact?, tags: Vec<String>, category?,
    project, source?, related_files: Vec<String>, file_path,
    section_anchor?, created_at, updated_at, status, archived_at?,
    archive_reason?, superseded_by?, updated_count: i64,
}
pub struct MemoryWithBody { memory, body?, size_bytes: i64 }
pub struct MemoriesFilter { project?, category?, status? = "active", limit? = 200, offset? = 0 }
pub struct MemoriesPage { total: i64, items: Vec<Memory>, projects: Vec<ProjectCount>, categories: Vec<CategoryCount> }
```

`#[serde(rename_all = "camelCase")]` на всех структурах.

### T-1.3 — Paths (`src-tauri/src/echovault/paths.rs`)

```rust
pub fn resolve_memory_home() -> Result<(PathBuf, &'static str)>
//   ("env" | "config" | "default")

pub fn index_db_path() -> Result<PathBuf>  // <home>/index.db
pub fn vault_root() -> Result<PathBuf>     // <home>/vault
```

YAML config — простой regex или serde_yaml. Поддерживаем `~` expansion через `dirs::home_dir()`.

### T-1.4 — Repo (`src-tauri/src/echovault/repo.rs`)

```rust
pub struct EchoVaultRepo { conn: Mutex<Connection> }

impl EchoVaultRepo {
  pub fn open() -> Result<Self> { ... }   // resolves home + opens
  pub fn list(&self, filter: &MemoriesFilter) -> Result<MemoriesPage> { ... }
  pub fn get(&self, id: &str) -> Result<Option<MemoryWithBody>> { ... }
}
```

- Connection wrapped in `Mutex` (Tauri commands могут вызываться параллельно из разных async-task; rusqlite Connection не Sync).
- Rows mapping вручную через `query_map` + helper для парсинга JSON-arrays и optional fields.
- `MemoriesPage::projects` / `categories` агрегируется через `GROUP BY` в одном запросе с UNION или двумя отдельными запросами.

### T-1.5 — Tauri commands (`src-tauri/src/commands/memories.rs`)

```rust
#[tauri::command]
pub async fn list_memories(state: State<'_, AppState>, filter: MemoriesFilter) -> Result<MemoriesPage, String>

#[tauri::command]
pub async fn get_memory(state: State<'_, AppState>, id: String) -> Result<Option<MemoryWithBody>, String>
```

Errors as String (через `.map_err(|e| e.to_string())`) — Tauri требует Serialize у Err.

### T-1.6 — Wire-up в `lib.rs`

```rust
let repo = EchoVaultRepo::open().expect("init echovault repo");
tauri::Builder::default()
    .manage(AppState { repo: Arc::new(repo) })
    .invoke_handler(tauri::generate_handler![
        commands::memories::list_memories,
        commands::memories::get_memory,
    ])
    ...
```

Если `~/.memory/index.db` не существует — стартуем без repo (`AppState::repo: Option<Arc<...>>`); команды возвращают понятную ошибку «EchoVault not initialized».

### T-1.7 — Frontend

`src/lib/ipc.ts` — типизированные обёртки над `invoke`.
`src/lib/types.ts` — TS-типы зеркалят Rust-модели.
`src/main.tsx` — оборачиваем в `<QueryClientProvider>`.
`src/hooks/use-memories.ts` — `useMemoriesList(filter)`.
`src/App.tsx` — заголовок, total count, список первых 10 titles. Никакого 3-pane layout (Phase 2).

### T-1.8 — Golden test (`src-tauri/tests/echovault_golden.rs`)

```rust
#[test]
#[ignore]  // requires real ~/.memory/index.db
fn list_returns_memories() { ... assert!(page.total > 0); ... }

#[test]
#[ignore]
fn get_returns_body_for_first() { ... assert!(mem.body.is_some()); ... }
```

Запуск: `cargo test --manifest-path src-tauri/Cargo.toml -- --ignored`.

### T-1.9 — STATE.md update + commit

Один atomic commit на всю фазу:
`feat(01): echovault read-repo + IPC commands + frontend wiring`

## Риски

| Риск | Митигация |
|---|---|
| `rusqlite=0.32` несовместим с актуальной версией Tauri | Переключиться на `0.31`. Tauri не использует rusqlite внутри, конфликта быть не должно. |
| Bundled SQLite не имеет FTS5 | Feature `bundled` его включает (default config tcc-distributed). Проверим тестом. |
| Owner переехал `MEMORY_HOME` | Уже учтено в `resolve_memory_home()`. |
| Encoding кириллицы в console — кракозябры в Bash output | Это вопрос только tooling-вывода, в SQLite UTF-8. На UI должно быть нормально. |

## Не делаем в Phase 1

- ❌ FTS5 search query (Phase 3)
- ❌ sqlite-vec / semantic search (Phase 3)
- ❌ Filters UI (Phase 3)
- ❌ Архив / удаление / редактирование (Phase 4-5)
- ❌ Markdown rendering (Phase 2)
- ❌ 3-pane layout (Phase 2)
- ❌ File watcher (Phase 6)
