# Echo Studio — STATE

> Текущее состояние проекта. Обновляется на каждом значимом шаге.

## Status: Phase 1 complete (echovault read-repo)

- 2026-05-02 (init): commit `1813264` — планирование, 37 FR/NFR, 13-фазный roadmap
- 2026-05-02 (Phase 0): commit `d7ff8e6` — Tauri 2 + React 19 skeleton
- 2026-05-02 (Phase 1): EchoVault read-repo + IPC + frontend wiring → 182 memories owner'а отображаются

## Зафиксированные решения

См. `PROJECT.md → Ключевые архитектурные решения` (A-01..A-08).

Дополнительно из Phase 1:
- A-09: rusqlite `bundled` (без системной зависимости от sqlite). FTS5 включён в bundled. sqlite-vec отложен до Phase 3 (semantic search).
- A-10: Connection открыта `READ_ONLY | NO_MUTEX` для Phase 1. Будет переоткрыта в RW-режиме в Phase 4.
- A-11: `tags` и `related_files` в EchoVault — JSON-массивы в TEXT-столбце (не CSV). С fallback на CSV для битых данных.
- A-12: `EchoVaultRepo` лежит в `AppState` как `Option<Arc<...>>` — приложение стартует даже если `~/.memory/index.db` отсутствует, команды возвращают понятную ошибку.

## Phase 1 — DoD checklist

- [x] `list_memories(filter)`, `get_memory(id)` зарегистрированы и вызываемы из JS
- [x] Модели сериализуются в camelCase JSON, схема DB зеркалится
- [x] `tags`, `related_files` парсятся из JSON-array TEXT
- [x] `resolve_memory_home()` поддерживает env / yaml-config / default
- [x] Frontend: TanStack Query + `useMemoriesList()` показывает реальные данные
- [x] Golden tests 4/4 (real ~/.memory/, 182 memories, 11 projects)
- [x] `cargo clippy --all-targets -- -D warnings` зелёный
- [x] `pnpm typecheck` + `pnpm biome check` + `pnpm build` зелёные

## Открытые вопросы

- Brand: точный clone Claude Desktop (для личного использования)
- Code-signing: отложено до v0.2.0
- Embeddings provider: используем дефолт EchoVault, не переопределяем

## Следующий шаг

Phase 2 — Memories UI shell (3-pane layout, sidebar projects, virtualized list, detail view с markdown render).
