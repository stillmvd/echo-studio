# Echo Studio — STATE

> Текущее состояние проекта. Обновляется на каждом значимом шаге.

## Status: Phase 2 complete (memories UI shell)

- 2026-05-02 (init): commit `1813264` — планирование, 37 FR/NFR, 13-фазный roadmap
- 2026-05-02 (Phase 0): commit `d7ff8e6` — Tauri 2 + React 19 skeleton
- 2026-05-02 (Phase 1): commit `f7df1b6` — EchoVault read-repo + IPC + frontend wiring (4/4 golden tests)
- 2026-05-02 (Phase 2): 3-pane layout, sidebar, virtualized list, detail с markdown, drag-resize panes, tab-навигация

## Зафиксированные решения

См. `PROJECT.md → Ключевые архитектурные решения` (A-01..A-08) + Phase 1 (A-09..A-12).

Дополнительно из Phase 2:
- A-13: `react-resizable-panels@3` (не v4 — у v4 breaking-rename API на Group/Separator).
- A-14: zustand с `persist` middleware для UI-state (`echo-studio.ui` в localStorage). Selection memory НЕ персистится — только filters и detailMode.
- A-15: `rehype-highlight` + `highlight.js` тема `github-dark-dimmed` (не shiki — для меньшего bundle).
- A-16: Markdown оформляется через CSS-классы `.echo-markdown` в globals.css (не component overrides) — единая стилистика, проще править.

## Phase 2 — DoD checklist

- [x] 3 panes drag-resizable через `react-resizable-panels`
- [x] Sidebar: projects + categories + status-toggle (active/archived/all)
- [x] Memory list виртуализирован через `@tanstack/react-virtual` (overscan=8)
- [x] Selection state в zustand с persist
- [x] Detail pane: header + what/why/impact/related-files + markdown body + Rendered/Raw toggle + meta footer (id, действия-заглушки)
- [x] Tab-bar: Memories (active) + Conversations + Settings (заглушки)
- [x] Layout sizes сохраняются (autoSaveId)
- [x] `pnpm typecheck/biome/build` зелёные (652 KB JS — 200 KB gzip)
- [x] `cargo check` зелёный (UI-only фаза, Rust не трогался)

## Открытые вопросы

- 652 KB JS bundle — большой из-за highlight.js + react-markdown. В Phase 11 (QA) посмотреть code-splitting / dynamic import.
- Brand: точный clone Claude Desktop (для личного использования)

## Следующий шаг

Phase 3 — Filters + search (FR-MEM-01, FR-MEM-02): фильтры по tags/date, FTS5 + semantic search через sqlite-vec, sort options, debounced search.
