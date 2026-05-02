# Echo Studio — STATE

> Текущее состояние проекта. Обновляется на каждом значимом шаге.

## Status: Phase 6 complete (auto-sync engine — file watcher + reindex)

- 2026-05-02 (init): commit `1813264`
- 2026-05-02 (Phase 0): commit `d7ff8e6` — Tauri 2 + React 19 skeleton
- 2026-05-02 (Phase 1): commit `f7df1b6` — read-repo + IPC
- 2026-05-02 (Phase 2): commit `894ec6b` — 3-pane layout
- 2026-05-02 (Phase 2 polish): commit `3c220ae` — dark scrollbars
- 2026-05-02 (Phase 3): commit `c9b9fa2` — filters + search
- 2026-05-02 (Phase 4): commit `1fabf35` — writes + bulk + backup
- 2026-05-02 (Phase 4 polish): commit `1c67474` — dark checkboxes
- 2026-05-03 (Phase 5): commit `5c6ca74` — edit form + Claude Code launcher
- 2026-05-03 (Phase 6): file watcher + reindex worker + status bar

## Зафиксированные решения

См. PROJECT.md (A-01..A-08), Phase 1-5 (A-09..A-31).

Дополнительно из Phase 6:
- A-32: Watcher через `notify-debouncer-mini` (debounce 500ms) на
  одиночный файл `~/.memory/index.db`. WAL-файлы (-wal/-shm) игнорируем
  потому что debouncer всё равно сглаживает burst при коммите WAL.
- A-33: `memory reindex` спавнится через subprocess. Поиск exe:
  PATH lookup → fallback glob `~/AppData/Local/Python/pythoncore-*/
  Scripts/memory.exe`. Если не нашли — UI показывает ошибку в status bar.
- A-34: Reindex прогресс стримится через Tauri events
  (`echovault://reindex-progress` / `done` / `error`). Frontend hook
  `useReindex()` агрегирует state + автоматически invalidate
  `['memories']` при `done`.
- A-35: Reindex запускается ВРУЧНУЮ через кнопку в status bar.
  Auto-spawn после каждой write-op отложен до Phase 10 (Settings:
  «Auto-reindex on edit» toggle).

## Phase 6 — DoD checklist

- [x] `notify` watch index.db, debounce 500ms, emit `echovault://changed`
- [x] Frontend `useDbWatcher` invalidate queries на event
- [x] `trigger_reindex` Tauri command — spawn `memory reindex`, stream stdout
- [x] `useReindex` hook агрегирует progress / done / error events
- [x] StatusBar внизу AppShell: watching dot + count + path + Reindex button
- [x] Capabilities: shell:allow-spawn для `memory`
- [x] `cargo clippy --all-targets -- -D warnings` зелёный
- [x] Все pre-commit checks зелёные

## Следующий шаг

Phase 7 — Conversations: list. Парсинг `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`
заголовков (первые ~10 строк), агрегация по проектам, dropdown «Older
than N days», UI вкладки Conversations.
