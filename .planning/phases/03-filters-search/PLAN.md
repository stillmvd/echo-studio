# Phase 3 — Filters + Search

## Goal

Удобный layer фильтрации и поиска поверх Phase 1 read-repo:
1. Полнотекстовый поиск через FTS5 (мгновенный, без сети) — основной режим.
2. Семантический поиск через `sqlite-vec` + локальный Ollama
   (`nomic-embed-text`) — toggle, gracefully fallback к FTS5 если Ollama
   недоступен.
3. Filter chips: tags (multi), date range (преcеты 7d/30d/90d/all).
4. Sort options: updated ↓ (default), created ↓, title ↑, project ↑.
5. Debounced search (300ms), highlighting matched terms в title/what.

## Definition of Done

- [ ] Search box с debounce 300ms, очисткой через ✕, режимом lex/sem/hybrid
- [ ] Tag-chips: список tag'ов из текущего фильтра с counters, multi-select
- [ ] Date range presets: 7d / 30d / 90d / all
- [ ] Sort dropdown: 4 опции
- [ ] Search highlighting в `MemoryRow` — подсветка совпадений в title и what
- [ ] sqlite-vec extension загружается и опрашивается; при отсутствии Ollama
      semantic-режим показывает баннер «Ollama not reachable, falling back to FTS»
- [ ] FTS5-режим возвращает результаты за < 50ms на 200 memories
- [ ] Backend tests: unit на `build_search_sql` + golden integration test
      `search_finds_known_token` (если в реальной БД owner'а есть memory с
      термином из тестового списка)
- [ ] Все pre-commit checks зелёные

## Закрывает требования

- **FR-MEM-01** Список memories с фильтрами project/category/tags/status/date
- **FR-MEM-02** Гибридный поиск FTS5 + semantic с UI-toggle

## Tasks

### T-3.1 — sqlite-vec dep + extension loading

- `sqlite-vec = "0.1"` (Rust crate с биндингами)
- В `Cargo.toml` добавить `rusqlite = {..., features = [..., "load_extension"]}`
- В `EchoVaultRepo::open()` после открытия conn:
  ```rust
  unsafe { conn.load_extension_enable()?; }
  sqlite_vec::sqlite3_vec_init();   // или helper `sqlite_vec::load(&conn)`
  unsafe { conn.load_extension_disable()?; }
  ```
- Проверка: `SELECT vec_version()` возвращает строку.

### T-3.2 — Расширение MemoriesFilter

```rust
pub struct MemoriesFilter {
  // existing
  pub project: Option<String>,
  pub category: Option<String>,
  pub status: Option<String>,
  pub limit: Option<i64>,
  pub offset: Option<i64>,
  // new
  pub query: Option<String>,
  pub mode: Option<SearchMode>,        // lexical | semantic | hybrid (default lexical)
  pub tags: Vec<String>,                // AND match
  pub date_from: Option<String>,        // ISO date
  pub date_to: Option<String>,
  pub sort_by: Option<SortBy>,          // updated_desc | created_desc | title_asc | project_asc
}
```

### T-3.3 — Search dispatcher (`echovault::search`)

```rust
pub fn search(repo, filter) -> Result<MemoriesPage>
  ├─ if query is None → repo.list(filter) (Phase 1 path)
  ├─ if mode = lexical → fts5_query
  ├─ if mode = semantic → embed_query → vec_query
  └─ if mode = hybrid → fts5 + vec, merge by reciprocal rank fusion
```

FTS5 query builder копирует логику из `memory/db.py::_build_fts_query`:
- split на токены, drop stop-words и < 2 символов
- `term1* OR term2*` синтаксис

Semantic query:
- POST http://localhost:11434/api/embeddings { model: "nomic-embed-text", prompt: query }
- Response → Vec<f32> 768-dim
- `SELECT memory_id FROM memories_vec WHERE embedding MATCH vec_to_blob(?) AND k = ? ORDER BY distance`
- Если запрос к Ollama failed (unreachable, timeout) → возвращаем понятную ошибку,
  фронт переключается на lexical с баннером.

### T-3.4 — `search_memories` Tauri command

`Result<MemoriesPage, String>` где Err — `EchoVaultError` или `OllamaUnreachable`.
Frontend ловит и переключает mode → lexical.

### T-3.5 — Tags aggregator

В `MemoriesPage` добавить `pub tags: Vec<TagCount>` — все unique tags из
текущей выборки с counters (для multi-select chips).

`TagCount { tag: String, count: i64 }`. Считается в SQL через JSON-парсинг
или Rust-стороне (json_each в SQLite).

### T-3.6 — Frontend FilterBar (`src/components/memories/FilterBar.tsx`)

Над списком memories, под TabBar:
```
┌──────────────────────────────────────────────────────────────────┐
│ 🔍 [search ...........] [×]    [Lex|Sem|Hyb]  [7d|30d|90d|All] │
│ #tag1 #tag2 #tag3                              Sort: [Updated▾] │
└──────────────────────────────────────────────────────────────────┘
```

Дебаунс через custom hook `useDebouncedValue(value, 300)`. Tag chips
кликабельны для toggle. Sort — простой dropdown.

### T-3.7 — Search highlighting

В `MemoryRow` принимаем `highlightTerms: string[]`. В title оборачиваем
совпадения `<mark>` (с tailwind подсветкой через accent-цвет).

### T-3.8 — UI store расширение

```ts
+ searchQuery: string
+ searchMode: 'lexical' | 'semantic' | 'hybrid'
+ selectedTags: string[]
+ dateRange: '7d' | '30d' | '90d' | 'all'
+ sortBy: 'updatedDesc' | 'createdDesc' | 'titleAsc' | 'projectAsc'
```

### T-3.9 — Tests

- Rust unit: `fts5_query_builder` с примерами (drop stop-words, OR-prefix)
- Rust unit: `merge_rrf` — reciprocal rank fusion алгоритм
- Golden: `search_finds_known_token` с term из реальной БД (например, "echovault")

### T-3.10 — Smoke + commit

`feat(03): filters and search — fts5, semantic via ollama, tag chips, sort`

## Риски

| Риск | Митигация |
|---|---|
| `sqlite-vec` Rust crate API не работает с rusqlite 0.32 | Откатиться на 0.31; альтернатива — `conn.load_extension(path, entry)` напрямую с DLL. |
| Bundled SQLite в rusqlite не имеет `load_extension` | Feature `load_extension` нужен в Cargo.toml. |
| Ollama не запущен → semantic-search ломается | Graceful fallback: возвращаем `OllamaUnreachable`, фронт показывает баннер и переключается на lexical. |
| FTS5 token-tokenizer (porter unicode61) хуже работает с кириллицей | Это уже выбор EchoVault; Phase 3 ничего не меняет, только использует. |

## Не делаем в Phase 3

- ❌ Сложные SQL-операторы (NEAR, NOT) — Phase 11 polish
- ❌ Saved searches — backlog
- ❌ Поиск по body (memory_details.body) — backlog (FTS5 содержит только head fields)
- ❌ Реактивный пересчёт `tags` aggregator при partial loading — Phase 11
