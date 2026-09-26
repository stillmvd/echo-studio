# Echo Studio — ROADMAP

## Milestone v0.1.0 (MVP1) — портативное приложение для управления memories + просмотра conversations

**Estimate:** ~12.5 рабочих дней (single dev).

| # | Phase | Goal | Closes | Depends on |
|---|---|---|---|---|
| 0 | **Skeleton** | `cargo tauri init` + Vite + Tailwind 4 + shadcn + lefthook + biome + первый запуск пустого окна | FR-COM-06 | — |
| 1 | **EchoVault read-repo** | Rust-команды `list_memories` / `get_memory` / golden-tests против реальной `~/.memory/` | — | 0 |
| 2 | **Memories UI shell** | 3-pane layout, sidebar projects, virtualized list, detail view (markdown render, raw toggle), drag-resize | FR-MEM-03, FR-COM-05 | 1 |
| 3 | **Filters + search** | Фильтры project/category/tags/status/date, FTS5+semantic поиск, sort, debounce | FR-MEM-01, FR-MEM-02 | 2 |
| 4 | **EchoVault writes (archive/delete)** | `archive_memory` / `delete_memory` + markdown section editor + backup-before-write + bulk | FR-MEM-06, FR-MEM-07, FR-MEM-08 | 1 |
| 5 | **Forms + Claude Code launcher** | Create/edit form (split markdown editor), «Open in Claude Code» dialog с 3 шаблонами | FR-MEM-04, FR-MEM-05, FR-MEM-09 | 4 |
| 6 | **Auto-sync engine** | FTS update в одной tx, фоновый `memory reindex` worker, file watcher, status bar progress | FR-MEM-10, FR-COM-02 | 5 |
| 7 | **Conversations: list** | `list_projects` + `list_sessions` (parse `.jsonl` headers), tab UI, dropdown «Older than N days» | FR-CONV-01, FR-CONV-02 | 0 |
| 8 | **Conversations: viewer + search** | Streaming JSONL reader, timeline render, in-session + cross-session search | FR-CONV-03, FR-CONV-04, FR-CONV-05 | 7 |
| 9 | **Conversations: delete + export** | Bulk-delete старых сессий, export-to-markdown | FR-CONV-06, FR-CONV-07 | 8 |
| 10 | **Settings + theme polish** | Settings page, design-token review, accessibility, Geist шрифты, status bar | FR-COM-01, FR-COM-03, FR-COM-04 | 6, 9 |
| 11 | **QA pass** | Bug fixes, performance budgets, manual UAT checklist | NFR-01..05 | 10 |
| 12 | **Release v0.1.0** | Build, portable ZIP, GitHub release, README/CHANGELOG | — | 11 |

## Зависимости (граф)

```
0 ─┬─→ 1 → 2 → 3
   │       ↓
   │       4 → 5 → 6 ─→ 10 → 11 → 12
   │                    ↑
   └─────→ 7 → 8 → 9 ───┘
```

Phases 1+2+3 (EchoVault) и 7+8+9 (Conversations) независимы — можно параллелить.

## Backlog (после v0.1.0)

- v0.2.0: code-signing (если получим cert), NSIS installer, light theme, EN locale, sentry-tauri opt-in
- v0.3.0: MCP-серверы / Skills / Commands viewer (по проекту + global) — **в работе с 2026-09-26**, см. ниже
- v0.4.0: macOS build, AppData-portable mode (no system writes)
- v0.5.0: full edit для conversations (rename session, edit messages with confirmation)
- v1.0.0: после полевого использования + минимум 2 release циклов

## v0.3.0 — обзор инструментов Claude (начат 2026-09-26)

Вкладка вместо Memories: skills, plugins, MCP-серверы, commands и agents — глобальные, проектные и из
плагинов. EchoVault вырезается целиком в рамках этой же фичи. Планирование — spec-kit
(`.specify/`, спеки в `specs/`), порядок: constitution → specify → clarify → plan → tasks → implement.

Решения пользователя (2026-09-26):
- Состав: skills, plugins, MCP-серверы, commands, agents. Hooks — вне объёма.
- Действия: просмотр + включение/выключение plugins, MCP-серверов и skills (skills — если у Claude Code
  есть штатный способ). Остальное только смотреть.
- Проекты — из Conversations (cwd сессий) и `~/.claude.json`.
- Главный список — по области: Global, затем проекты; внутри — фильтр по типу.
- Для проекта — итог «что видит Claude»: глобальное + проектное + из включённых плагинов, с пометкой
  источника и перекрытий.
- Список обновляется сам при изменении файлов конфигурации.

### Дизайн — стенд на каждый компонент

Форму каждого нового компонента выбирает пользователь, как в редизайне (`.planning/REDESIGN-TRAIL.md`,
команда `/redesign-stand`), с одним отличием: **блока «Сейчас» нет** — компонента ещё не существует.
Стенд = части с вариантами + киоск (`<ссылка>#kiosk`) со сборкой выбранного и сегментом «Состояние».
Данные на стенде — настоящие с этой машины (skills, plugins, MCP). Порядок на каждом шаге: стенд →
выбор пользователя («Выбор: …») → запись в журнал → реализация → проверка пользователем → коммит.
Язык Trail и решения шагов 1–6 редизайна — база, не пересматриваются.
