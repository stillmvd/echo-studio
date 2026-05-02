# Echo Studio — STATE

> Текущее состояние проекта. Обновляется на каждом значимом шаге.

## Status: Phase 3 complete (filters + search)

- 2026-05-02 (init): commit `1813264` — планирование, 37 FR/NFR, 13 phases
- 2026-05-02 (Phase 0): commit `d7ff8e6` — Tauri 2 + React 19 skeleton
- 2026-05-02 (Phase 1): commit `f7df1b6` — EchoVault read-repo + IPC + frontend wiring (4/4 golden)
- 2026-05-02 (Phase 2): commit `894ec6b` — 3-pane layout, virtualized list, markdown detail
- 2026-05-02 (Phase 2 polish): commit `3c220ae` — dark scrollbars
- 2026-05-02 (Phase 3): filters + search (FTS5 + semantic via Ollama + RRF + tag chips + sort + date range)

## Зафиксированные решения

См. PROJECT.md (A-01..A-08), Phase 1 (A-09..A-12), Phase 2 (A-13..A-16).

Дополнительно из Phase 3:
- A-17: `sqlite-vec` registered через `sqlite3_auto_extension` в `Once::call_once` — глобально, чтобы каждое новое Connection автоматически имело vec0.
- A-18: Reciprocal Rank Fusion (RRF) с k=60 для hybrid-mode (lex+sem). Не используем weighted scores — простая ранговая агрегация.
- A-19: Ollama-fallback: если semantic / hybrid выбраны, но Ollama недоступен — возвращаем результат FTS5 + поле `semanticWarning` с message; UI показывает баннер.
- A-20: Tag aggregator уважает project/category-фильтры, но игнорирует search-query — чтобы chips не «исчезали» при опечатке.
- A-21: Search highlighting frontend-side (tokenize query по unicode-границам, регэксп с UI-marks). Backend не возвращает offsets — экономия на сериализации.

## Phase 3 — DoD checklist

- [x] Search box (debounce 300ms, ✕ для очистки), 3 режима lex/sem/hyb
- [x] Tag chips multi-select с counters (60 max)
- [x] Date range presets: all / 7d / 30d / 90d
- [x] Sort dropdown: Updated ↓ / Created ↓ / Title ↑ / Project ↑
- [x] Search highlighting в title (frontend-side)
- [x] sqlite-vec extension auto-loaded
- [x] FTS5 query builder копирует логику EchoVault (drop stopwords, OR-prefix, dedup)
- [x] Semantic via Ollama POST /api/embeddings (nomic-embed-text)
- [x] RRF merge для hybrid
- [x] Graceful fallback на FTS5 при недоступном Ollama + UI-баннер
- [x] 8 unit tests Rust зелёные
- [x] 4 golden tests Rust зелёные (Phase 1)
- [x] `pnpm typecheck/biome/build`, `cargo clippy --all-targets -- -D warnings` зелёные

## Известные ограничения

- Bundle JS вырос до 712 KB (215 KB gzip) — react-markdown + highlight.js. В Phase 11 (QA) посмотрим code-splitting.
- Поиск по `body` (memory_details) не включён — FTS5 таблица содержит только head fields (decision EchoVault).
- Embeddings model жёстко nomic-embed-text. В Phase 10 (Settings) добавим выбор.

## Следующий шаг

Phase 4 — EchoVault writes (archive/delete + bulk + backup-before-write). Нужно:
- Открыть Connection в RW-режиме (заменить флаги в `EchoVaultRepo::open`)
- Реализовать `archive_memory`, `delete_memory`, `bulk_archive`, `bulk_delete`
- Atomic tx + write/edit markdown sections в `vault/`
- Backup `index.db` перед каждой destructive op (`~/.memory/.backups/`)
- UI: confirm-dialogs, multi-select в списке, прогресс bulk
