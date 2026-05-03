# Phase 9 — Conversations: Delete + Export

## Goal

Возможность чистить старые `.jsonl` сессии (single + bulk + age-filter)
и экспортировать сессию в читаемый markdown файл.

## Definition of Done

- [ ] `delete_conversation_session(file_path)` Rust — fs::remove_file
- [ ] `bulk_delete_conversation_sessions(file_paths)` Rust
- [ ] Multi-select в SessionTable (checkboxes + select-all)
- [ ] BulkActionBar над таблицей при selection > 0: count + Delete +
      Cancel (с confirm-dialog)
- [ ] Age-filter в SessionTable header: All / Older than 30/90/365
      days (использует existing custom Select)
- [ ] Export button в SessionViewer header — генерирует markdown из
      events client-side, открывает Save-dialog (tauri-plugin-dialog),
      пишет файл (tauri-plugin-fs)
- [ ] All checks зелёные

## Закрывает требования

- **FR-CONV-06** Bulk-delete старых сессий
- **FR-CONV-07** Export сессии в markdown

## Tasks

### T-9.1 — Backend delete commands

```rust
#[tauri::command]
pub async fn delete_conversation_session(file_path: String) -> Result<(), String>

#[tauri::command]
pub async fn bulk_delete_conversation_sessions(file_paths: Vec<String>) -> Result<BulkDeleteResult, String>
```

`BulkDeleteResult { deleted: Vec<String>, failed: Vec<{path, error}> }`.
Безопасность: проверяем что path начинается с `~/.claude/projects/`,
только тогда delete (защита от accidental delete вне scope'а).

### T-9.2 — Frontend ui-store

```ts
+ conversationsBulkSelection: string[]    // file paths
+ conversationsAgeFilter: 'all' | 'older30' | 'older90' | 'older365'
```

### T-9.3 — Frontend hooks

`hooks/use-session-actions.ts`:
- `useDeleteSession()` — invalidate ['conversations']
- `useBulkDeleteSessions()` — clear selection on success

### T-9.4 — SessionTable updates

- Add column 0: checkbox
- Header row: select-all checkbox
- Filter dropdown в header (Age filter) через existing Select
- Wire age filter в client-side filtering перед sort
- BulkActionBar component (новый, для conversations) над таблицей
  при selection > 0
- Click row → если selection не пустой, toggle selection
  иначе open session viewer

Actually simplification: row click ALWAYS opens viewer. Checkbox click
toggles selection (stop propagation).

### T-9.5 — SessionViewer Export

В header добавить кнопку Export:
1. Read events
2. Format markdown:
   ```
   # Session <id>
   <meta line>

   ---

   ## [USER] HH:MM:SS
   <content>

   ## [ASSISTANT] HH:MM:SS
   <content>
   ...
   ```
3. `import { save } from '@tauri-apps/plugin-dialog'` →
   suggest `${sessionId}.md` filename
4. `import { writeTextFile } from '@tauri-apps/plugin-fs'`

### T-9.6 — Smoke + commit

`feat(09): conversations delete + bulk + age filter + markdown export`

## Не делаем в Phase 9

- ❌ Restore deleted (нет soft-delete; delete = hard, файл удаляется)
- ❌ ZIP-export всего проекта — backlog
- ❌ Edit session content — out of scope MVP
