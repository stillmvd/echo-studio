# Implementation Plan: Уведомления агентов и одинаковые инструменты

**Branch**: `003-agent-notices-shared-tools` (работа в `main`, локальные коммиты) | **Date**: 2026-09-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-agent-notices-shared-tools/spec.md`

## Summary

v0.4.0. Лента сессии: `type: user` с `origin.kind: "task-notification"` (или текстом `<task-notification>`)
становится шагом «Agent "…" finished · status» со свёрнутым отчётом — только фронтенд (`raw` уже приходит).
Tools: `mark_conflicts` переписан на реальный приоритет Claude Code (global > project для skills/commands,
skill > command, project > user для agents, local > project > user для MCP, плагины и выключенные не
участвуют) — вместо `sameName` поля «кем перекрыт / кого перекрывает». Новый IPC `list_tool_copies` —
индекс файлов skills/commands/agents по Global, известным проектам и плагинам с хэшем и mtime; из него
фронтенд считает «also in N projects» и секцию «Also found in». Область проекта: свои сверху, глобальные — в
группе «Inherited from Global · N»; «Project only» и «N duplicates» удалены, вместо них чип «N overridden».

## Technical Context

**Language/Version**: Rust (edition 2021, tauri 2), TypeScript 7 / React 19

**Primary Dependencies**: TanStack Query/Virtual, zustand (persist), Tailwind 4, lucide-react; новых нет
(хэш — `std::hash::DefaultHasher`, достаточно в пределах процесса)

**Storage**: localStorage через zustand persist (раскрытие «Inherited»); файлы Claude Code — только чтение

**Testing**: Vitest (`src/lib`), `cargo test` (`tooling/effective.rs`, `tooling/copies.rs`)

**Target Platform**: Windows 10/11, WebView2

**Project Type**: desktop-app (Tauri: `src-tauri/` + `src/`)

**Performance Goals**: индекс копий ~40 проектов + ~150 глобальных + плагины — под 300 мс в `spawn_blocking`;
кэш TanStack Query, сброс по событию наблюдателя вместе с остальным `['tooling']`

**Constraints**: никаких записей (SC-005); `list_tool_copies` читает только корни из `known_scopes` и папки
плагинов; формы — со стендов 7 и 8 (FR-017)

**Scale/Scope**: ~200 элементов в области, ~40 областей, ~600 файлов в индексе

## Constitution Check

| Принцип | Проверка | Итог |
|---|---|---|
| I. Config belongs to the user | Только чтение; «Show in folder» — существующий `reveal_in_explorer` | ✅ |
| II. Guarded file access | Индекс строится из фиксированных корней (Global, known projects, plugin installPath), путей от webview не берёт | ✅ |
| III. Resilient reading | Нечитаемый файл — место с `hash: null` («unreadable»); битая разметка уведомления — старый вид | ✅ |
| IV. Responsive desktop | Индекс — `spawn_blocking`, лениво по запросу | ✅ |
| V. Local and private | Сети нет | ✅ |
| VI. Simplicity / Trail | Одна новая команда, одна чистая функция разбора; стенды 7 (шаг агента) и 8 (одинаковые инструменты) | ✅ |

Повторная проверка после дизайна — без изменений.

## Project Structure

### Documentation (this feature)

```text
specs/003-agent-notices-shared-tools/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/ipc.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
src-tauri/src/tooling/mod.rs            # ToolItem: overriddenBy / overrides вместо Conflict::SameName
src-tauri/src/tooling/effective.rs      # mark_conflicts по приоритету Claude Code (+ тесты)
src-tauri/src/tooling/copies.rs         # индекс копий: scan_root по корням, хэш, mtime (+ тесты)
src-tauri/src/commands/tooling.rs       # list_tool_copies
src/lib/types.ts, src/lib/ipc.ts        # ToolCopy, listToolCopies
src/lib/tooling.ts                      # copiesFor, alsoInProjects, splitInherited (+ тесты)
src/lib/agent-notice.ts                 # parseAgentNotice (+ тесты)
src/lib/session-feed.ts                 # узел 'agent'
src/lib/session-export.ts               # «Agent» в экспорте
src/hooks/use-tooling.ts                # useToolCopies
src/state/ui-store.ts                   # toolsOverriddenOnly; удалить toolsProjectOnly, toolsDuplicatesOnly
src/components/tooling/ToolList.tsx     # группа Inherited, чип overridden, без Project only
src/components/tooling/ToolRow.tsx      # пометки перекрытия, «also in N projects»
src/components/tooling/ToolDetail.tsx   # секция Also found in
src/components/conversations/SessionViewer.tsx  # шаг агента (форма со стенда 7)
.planning/sketches/107-agent-notice/, 108-shared-tools/  # стенды
```

**Structure Decision**: существующая раскладка; новый модуль Rust только для индекса копий, новый файл TS —
только для разбора уведомления.

## Complexity Tracking

Нарушений конституции нет.
