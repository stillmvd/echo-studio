# Implementation Plan: Доработки после приёмки v0.3.0

**Branch**: `002-acceptance-polish` (работа в `main`, локальные коммиты) | **Date**: 2026-09-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-acceptance-polish/spec.md`

## Summary

Пять правок поверх v0.3.0. Лента сессии: превью результата инструмента без обрезки нижнего отступа;
вызов `AskUserQuestion` — карточка «вопрос → ответ» из входа вызова и `toolUseResult` результата. Вкладка
Tools: skills в группах (плагин / префикс ≥3) со сворачиванием; дубликаты учитывают skills плагинов, чип
«N duplicates» фильтрует список; missing-проекты — свёрнутая группа в конце панели областей и экран с числом
сессий и переходом в Conversations. Новые IPC не нужны; бэкенд меняется только в разметке конфликтов.

## Technical Context

**Language/Version**: Rust (edition 2021, tauri 2), TypeScript 7 / React 19

**Primary Dependencies**: TanStack Query/Virtual, zustand (persist), Tailwind 4, lucide-react

**Storage**: localStorage через zustand persist (раскрытые группы); файлы Claude Code — только чтение

**Testing**: Vitest (чистые функции в `src/lib`), `cargo test` (`tooling/effective.rs`)

**Target Platform**: Windows 10/11, WebView2

**Project Type**: desktop-app (Tauri: `src-tauri/` + `src/`)

**Performance Goals**: список Tools остаётся виртуализированным; группировка — O(n) на показанный список

**Constraints**: конфиг Claude Code не пишется (FR-009); форма групп и карточки — со стенда (FR-014)

**Scale/Scope**: ~200 элементов в области, ~40 областей, сессии до десятков МБ

## Constitution Check

| Принцип | Проверка | Итог |
|---|---|---|
| I. Config belongs to the user | Missing-проекты и дубликаты — только чтение; записи нет | ✅ |
| II. Guarded file access | Новых файловых команд нет | ✅ |
| III. Resilient reading | Неразобранный ответ — карточка с исходным текстом (FR-011) | ✅ |
| IV. Responsive desktop | Группы — строки того же виртуализатора; новых сканов нет | ✅ |
| V. Local and private | Сетевых вызовов нет | ✅ |
| VI. Simplicity / Trail | Стенды 5 (группы skills) и 6 (карточка вопроса); без новых абстракций | ✅ |

Повторная проверка после дизайна — без изменений.

## Project Structure

### Documentation (this feature)

```text
specs/002-acceptance-polish/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
src-tauri/src/tooling/effective.rs      # конфликты: skills плагинов в группах имён
src/lib/tooling.ts                      # groupSkills, isDuplicate (+ тесты)
src/lib/ask-question.ts                 # разбор вопроса/ответа (+ тесты)
src/lib/session-export.ts               # экспорт «вопрос → ответ»
src/state/ui-store.ts                   # toolsOpenGroups, toolsDuplicatesOnly
src/components/tooling/ToolList.tsx     # строки-группы в виртуализаторе, чип duplicates
src/components/tooling/ScopePanel.tsx   # группа Missing · N
src/components/tooling/MissingScope.tsx # экран missing-проекта
src/components/conversations/SessionViewer.tsx      # превью результата, карточка вопроса
src/components/conversations/AskQuestionCard.tsx    # карточка (форма со стенда 6)
.planning/sketches/105-skill-groups/, 106-ask-card/ # стенды
```

**Structure Decision**: существующая раскладка Tauri; новые файлы только там, где появляется новый компонент
или чистая функция с тестами.

## Complexity Tracking

Нарушений конституции нет.
