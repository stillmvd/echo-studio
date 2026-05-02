# Echo Studio — STATE

> Текущее состояние проекта. Обновляется на каждом значимом шаге.

## Status: Phase 4 complete (echovault writes — archive/delete + bulk + backup)

- 2026-05-02 (init): commit `1813264` — планирование, 37 FR/NFR, 13 phases
- 2026-05-02 (Phase 0): commit `d7ff8e6` — Tauri 2 + React 19 skeleton
- 2026-05-02 (Phase 1): commit `f7df1b6` — EchoVault read-repo + IPC
- 2026-05-02 (Phase 2): commit `894ec6b` — 3-pane layout, virtualized list, markdown
- 2026-05-02 (Phase 2 polish): commit `3c220ae` — dark scrollbars
- 2026-05-02 (Phase 3): commit `c9b9fa2` — filters + search (FTS5 + semantic + RRF)
- 2026-05-02 (Phase 4): writes (archive/restore/delete) + bulk + backup-before-write

## Зафиксированные решения

См. PROJECT.md (A-01..A-08), Phase 1 (A-09..A-12), Phase 2 (A-13..A-16), Phase 3 (A-17..A-21).

Дополнительно из Phase 4:
- A-22: Connection переоткрыт `READ_WRITE | NO_MUTEX` + `busy_timeout=2000ms` для конкурентного доступа с EchoVault MCP-сервером.
- A-23: Backup-before-write — `fs::copy` index.db в `~/.memory/.backups/index.YYYYMMDD-HHMMSS.db` ПЕРЕД любой destructive op. Rotation: keep last 20.
- A-24: Hard-delete атомарно: `INSERT INTO memories_fts('delete', ...)` (external-content table cleanup) → `DELETE memory_details` → `DELETE memories_vec` → `DELETE memories`. Всё в одной transaction.
- A-25: НЕ трогаем markdown файлы в `vault/` (per A-02 — index.db = SOT). EchoVault при следующей операции через `memory` CLI пересинхронизирует markdown. Документировано в commit message.
- A-26: Bulk ops лимит 1000 ids/operation. Один backup на всю bulk. Возвращают `BulkResult { succeeded, failed: [{id, error}], backupPath }`.

## Phase 4 — DoD checklist

- [x] `EchoVaultRepo::open()` теперь RW + busy_timeout 2s
- [x] `archive_memory(id, reason?)` — UPDATE status, archived_at, archive_reason, updated_at
- [x] `restore_memory(id)` — UPDATE status='active', clear archive fields
- [x] `delete_memory(id)` — atomic FTS5 delete-op + DELETE memory_details/vec/memories
- [x] `bulk_archive`, `bulk_restore`, `bulk_delete` с per-id error capture
- [x] `backup_db` engine: create + list + rotate (keep 20)
- [x] 10 Tauri commands зарегистрированы
- [x] Frontend: ConfirmDialog (modal с ESC/Enter/click-outside), кнопки Archive/Restore/Delete в MemoryDetail с reason input
- [x] Multi-select в MemoryList (checkboxes), select-all в header, indeterminate state
- [x] BulkActionBar над списком при `bulkSelectionIds.length > 0`
- [x] TanStack Query invalidation после каждой mutation
- [x] 12 unit tests Rust + 4 golden tests зелёные
- [x] `pnpm typecheck/biome/build`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt` зелёные

## Известные ограничения

- Markdown в `vault/` не синхронизируется при write-операциях. Это by design — EchoVault сам пересинхронизирует. Если пользователь просматривает .md напрямую, состояние может расходиться до следующей CLI-операции.
- FTS rebuild не делается — полагаемся на `'delete'` op в external-content table (она знает все индексированные поля по rowid).

## Следующий шаг

Phase 5 — Forms + Claude Code launcher: edit/create memory form, «Open in Claude Code» dialog с шаблонами (Save / Update / Investigate), spawn `wt claude --prompt-file <tmp>`.
