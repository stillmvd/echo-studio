# Echo Studio — STATE

> Текущее состояние проекта. Обновляется на каждом значимом шаге.

## Status: Phase 5 complete (forms + claude code launcher)

- 2026-05-02 (init): commit `1813264` — планирование, 37 FR/NFR, 13 phases
- 2026-05-02 (Phase 0): commit `d7ff8e6` — Tauri 2 + React 19 skeleton
- 2026-05-02 (Phase 1): commit `f7df1b6` — EchoVault read-repo + IPC
- 2026-05-02 (Phase 2): commit `894ec6b` — 3-pane layout, virtualized list, markdown
- 2026-05-02 (Phase 2 polish): commit `3c220ae` — dark scrollbars
- 2026-05-02 (Phase 3): commit `c9b9fa2` — filters + search (FTS5 + semantic + RRF)
- 2026-05-02 (Phase 4): commit `1fabf35` — writes (archive/restore/delete + bulk + backup)
- 2026-05-02 (Phase 4 polish): commit `1c67474` — custom dark checkboxes
- 2026-05-03 (Phase 5): edit form + Claude Code launcher (3 templates)

## Зафиксированные решения

См. PROJECT.md (A-01..A-08), Phase 1 (A-09..A-12), Phase 2 (A-13..A-16), Phase 3 (A-17..A-21), Phase 4 (A-22..A-26).

Дополнительно из Phase 5:
- A-27: Form-based **create** memory НЕ реализуем — нарушает A-25 (markdown sync). Создание идёт через «Open in Claude Code» button с шаблоном Save → Claude вызывает `memory_save` MCP, корректно создавая markdown.
- A-28: Edit memory обновляет только index.db (head fields + body). Markdown в `vault/` остаётся stale до следующего EchoVault CLI reindex. Documented в EditMemoryDialog description.
- A-29: «Open in Claude Code» = `wt -d <cwd> claude` (Windows Terminal). Prompt копируется в clipboard через `navigator.clipboard.writeText`, юзер вставляет Ctrl+Shift+V.
- A-30: 3 шаблона prompt'а (`save` / `update` / `investigate`). Update template включает текущие head fields для контекста.
- A-31: `MemoryPatch` использует `Option<Option<T>>` через custom `double_option` deserializer для различения «не менять» (None) vs «обнулить» (Some(None)).

## Phase 5 — DoD checklist

- [x] `update_memory(id, patch)` — UPDATE головных полей и/или memory_details body, с backup, atomic tx
- [x] `open_in_claude_code(cwd?)` — spawn `wt -d <cwd> claude`
- [x] `EditMemoryDialog` — title/category/tags chip-input/what/why/impact/body
- [x] `ClaudeCodeDialog` — 3 шаблона + editable prompt + cwd input + Launch
- [x] `+ New memory` button в TabBar (открывает Save template)
- [x] Edit / Open in Claude Code buttons активны в MemoryDetail
- [x] Capabilities: `shell:allow-spawn` для `wt`
- [x] 10 unit tests Rust + 4 golden зелёные
- [x] Все pre-commit checks зелёные

## Известные ограничения

- Edit обновляет только SQL — markdown drift до CLI reindex (документировано в UI).
- `wt` требуется (Windows Terminal). На голом Win10 без WT нужно установить из Microsoft Store. Phase 10 (Settings) добавит выбор терминала.
- Bundle JS вырос до 730 KB (220 KB gzip).

## Следующий шаг

Phase 6 — Auto-sync engine: file watcher на `~/.memory/index.db` через `notify` crate, фоновый `memory reindex` worker, status bar progress, invalidate query keys при внешних изменениях.
