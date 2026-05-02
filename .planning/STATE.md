# Echo Studio — STATE

> Текущее состояние проекта. Обновляется на каждом значимом шаге.

## Status: Phase 7 complete (conversations list)

- 2026-05-02 (init): commit `1813264`
- 2026-05-02 (Phase 0): commit `d7ff8e6`
- 2026-05-02 (Phase 1): commit `f7df1b6` — read-repo + IPC
- 2026-05-02 (Phase 2): commit `894ec6b` — 3-pane layout
- 2026-05-02 (Phase 2 polish): commit `3c220ae` — dark scrollbars
- 2026-05-02 (Phase 3): commit `c9b9fa2` — filters + search
- 2026-05-02 (Phase 4): commit `1fabf35` — writes + bulk + backup
- 2026-05-02 (Phase 4 polish): commit `1c67474` — dark checkboxes
- 2026-05-03 (Phase 5): commit `5c6ca74` — edit form + Claude Code launcher
- 2026-05-03 (Phase 6): commit `4a7179f` — file watcher + reindex + status bar
- 2026-05-03 (Phase 7): conversations list — JSONL parser + 2-pane viewer

## Зафиксированные решения

См. PROJECT.md (A-01..A-08), Phase 1-6 (A-09..A-35).

Дополнительно из Phase 7:
- A-36: JSONL streaming parser через BufRead — не загружаем целиком,
  важно для сессий 10+MB.
- A-37: Decoded cwd best-effort из folder name (split on `--`,
  replace `-` with `\\`). Реальный `cwd` извлекается из первой строки
  JSONL — он точный, но в encoded folder name теряются пробелы и
  оригинальные дефисы (encoding lossy).
- A-38: Sort state persist'ится (sortBy/sortDir для conversations).
  `conversationsProjectId` тоже — чтобы при возврате во вкладку был
  тот же выбранный проект.
- A-39: Project считается «активным» если в нём ≥ 1 jsonl. Пустые
  папки не отображаются.

## Phase 7 — DoD checklist

- [x] `list_conversation_projects()` — ConversationProject[]
- [x] `list_conversation_sessions(projectId)` — SessionMeta[]
- [x] JSONL streaming parse: sessionId, cwd, gitBranch, message_count
      (user+assistant), turn_duration sum, first/last timestamp
- [x] Decoded cwd best-effort + актуальный из JSONL
- [x] ConversationsLayout: 2-pane (projects sidebar + session table)
- [x] Sortable columns: Date / Duration / Msgs / Size
- [x] AppShell теперь рендерит ConversationsLayout (не placeholder)
- [x] cargo clippy/fmt + pnpm typecheck/biome/build зелёные

## Известные ограничения

- Manual refresh для projects (нет watcher на ~/.claude/projects/) —
  Phase 11 polish.
- Decoded display name из folder лосси (encoding теряет пробелы/дефисы).
  Реальный cwd берётся из JSONL, так что corrigible.

## Следующий шаг

Phase 8 — Conversations: viewer + search. Streaming JSONL reader для
открытия сессии, timeline render по типам событий, in-session и
cross-session поиск.
