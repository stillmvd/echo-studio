# Phase 4 — EchoVault Writes (Archive / Delete / Bulk)

## Goal

Безопасные destructive-операции над `~/.memory/index.db`: archive (status
update), hard-delete (полное удаление с очисткой FTS5/vec), restore из
архива, и bulk-варианты. Все destructive ops защищены автоматическим backup
файла `index.db` (rotation 20).

## Definition of Done

- [ ] `EchoVaultRepo::open()` теперь RW (`SQLITE_OPEN_READ_WRITE`)
- [ ] `archive_memory(id, reason?)` UPDATE row → status='archived'
- [ ] `restore_memory(id)` UPDATE row → status='active', clears archived_at/reason
- [ ] `delete_memory(id)` ATOMIC tx: FTS5 delete-op → DELETE memory_details
      → DELETE memories_vec → DELETE memories
- [ ] `bulk_archive(ids[], reason?)`, `bulk_delete(ids[])`, `bulk_restore(ids[])`
- [ ] `backup_db()` копирует `index.db` → `.backups/index.YYYYMMDD-HHMMSS.db`
      ПЕРЕД каждой destructive op, retention 20 (старше — удаляются)
- [ ] Tauri commands: archive_memory, restore_memory, delete_memory,
      bulk_archive, bulk_restore, bulk_delete, list_backups
- [ ] Frontend: кнопки Archive / Restore / Delete в `MemoryDetail` + confirm-dialog
- [ ] Multi-select в MemoryList (checkboxes), bulk-action-bar
- [ ] Все unit и golden tests зелёные; новые unit-тесты на backup rotation

## Закрывает требования

- **FR-MEM-06** Archive (status=archived + reason)
- **FR-MEM-07** Hard-delete с confirm + backup
- **FR-MEM-08** Bulk archive/delete по фильтру

## Tasks

### T-4.1 — Switch RW + helper methods

`EchoVaultRepo::open()`:
```rust
let conn = Connection::open_with_flags(
    &db_path,
    OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
)?;
```

Golden-тесты остаются read-only по факту, но открытие RW не ломает их.

### T-4.2 — Backup engine (`echovault::backup`)

```rust
pub fn create_backup(home: &Path) -> Result<PathBuf>
pub fn list_backups(home: &Path) -> Result<Vec<BackupInfo>>
pub fn rotate_backups(home: &Path, keep: usize) -> Result<usize>  // returns deleted count
```

`BackupInfo { path, created_at, size_bytes }`. Filename:
`index.YYYYMMDD-HHMMSS.db` (chrono). Создаём `.backups/` если нет.

### T-4.3 — Write methods в repo

```rust
impl EchoVaultRepo {
    pub fn archive(&self, id: &str, reason: &str) -> Result<bool>
    pub fn restore(&self, id: &str) -> Result<bool>
    pub fn hard_delete(&self, id: &str) -> Result<bool>
}
```

Все методы:
1. `create_backup(home)?` ПЕРВЫМ
2. `rotate_backups(home, 20)?`
3. Открыть transaction
4. Выполнить SQL
5. Commit

Для `hard_delete`:
```sql
-- получить rowid + поля для FTS delete-op
SELECT rowid, title, what, why, impact, tags, category, project, source FROM memories WHERE id = ?
-- delete-op в FTS (external-content table)
INSERT INTO memories_fts(memories_fts, rowid, ...) VALUES ('delete', ?, ?, ...)
DELETE FROM memory_details WHERE memory_id = ?
DELETE FROM memories_vec WHERE rowid = ?
DELETE FROM memories WHERE id = ?
```

### T-4.4 — Bulk methods

```rust
pub fn bulk_archive(&self, ids: &[String], reason: &str) -> Result<BulkResult>
pub fn bulk_restore(&self, ids: &[String]) -> Result<BulkResult>
pub fn bulk_delete(&self, ids: &[String]) -> Result<BulkResult>
```

`BulkResult { succeeded: Vec<String>, failed: Vec<(String, String)> }`. Один backup
на всю операцию (а не на каждый id). Один transaction.

### T-4.5 — Tauri commands

```
archive_memory(id, reason?)
restore_memory(id)
delete_memory(id)
bulk_archive_memories(ids, reason?)
bulk_restore_memories(ids)
bulk_delete_memories(ids)
list_db_backups()
```

После любой write-операции frontend инвалидирует `['memories']` queries.

### T-4.6 — Frontend: ConfirmDialog (Radix)

`src/components/ui/ConfirmDialog.tsx` — переиспользуемый dialog. Принимает
title, description, confirmLabel, danger?, onConfirm.

### T-4.7 — Frontend: actions в MemoryDetail

Active кнопки: Archive (с reason input), Delete (с confirm + предупреждение
о backup), Restore (если status='archived').

### T-4.8 — Frontend: multi-select + bulk bar

В MemoryList добавляем checkbox-режим. UI-store: `selectedIds: string[]`.
Bulk-action-bar над списком при `selectedIds.length > 0`: «N selected»,
«Archive all», «Delete all», «Cancel».

### T-4.9 — Tests

- unit `backup_rotation_keeps_n_newest`
- golden (ignored): archive_then_restore_round_trip — не пишет в реальную
  БД owner'а, использует tempdir + копию схемы
- Можем создать smoke-tempdir-test для writes на чистой БД

### T-4.10 — Smoke + commit

`feat(04): echovault writes — archive, delete, bulk + backup rotation`

## Не делаем в Phase 4

- ❌ Edit content (title/what/why/impact/details) — Phase 5
- ❌ Markdown synchronization (мы НЕ touch'аем `.md` файлы; EchoVault при
      следующей операции через `memory` CLI обновит их)
- ❌ Undo последней операции (можно сделать через restore_backup в backlog)
- ❌ Toast notifications — Phase 11 polish (пока используем banner)

## Риски

| Риск | Митигация |
|---|---|
| RW conflict с EchoVault MCP-сервером (другой процесс пишет) | SQLite WAL по умолчанию discoverable; делаем короткие tx; busy_timeout=2000ms |
| Backup file system errors | Show inline error в UI, не блокируем UI рестартом |
| Bulk delete очень большого списка тормозит | LIMIT 1000 на одну bulk-op в команде |
