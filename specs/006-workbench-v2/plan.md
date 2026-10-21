# Implementation Plan: Рабочее место v2

**Branch**: `workbench-v2` (интеграционная) | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

**Input**: `specs/006-workbench-v2/spec.md`; замечания и ограничения — `.planning/ORCHESTRATION-006.md`; база — фича 005
(`specs/005-workbench/`, `.planning/WORKBENCH.md`).

## Summary

Одиннадцать замечаний пользователя к «Рабочему месту» закрываются тремя пачками, каждая со своими исполнителями и
непересекающимися файлами:

- **Пачка 1 (п. 1–8)** — внешние сессии кликабельны (фокус окна по `claudePid`, поповер, «Продолжить в Echo»), worktree
  не в дереве + «Скрыть из дерева», распознавание agent view → «Отключено от сессии», «Стоп» и сегмент раскладки, значок
  Chrome, группировка процессов под сессиями и «Projects (корень)», скелетон списка разговоров, watching в полосе.
- **Пачка 2 (п. 9–10)** — модель раскладок на проект с режимами «Проект / Пульт» и DnD вкладок между ячейками.
- **Пачка 3 (п. 11)** — контекстное меню Kockers DS и его пункты по всем местам.

Ключевые решения — [research.md](research.md); типы и стор — [data-model.md](data-model.md); IPC —
[contracts/ipc.md](contracts/ipc.md); живые проверки — [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: Rust 2021 (Tauri 2), TypeScript 7 strict + React 19 — без изменений относительно 005.

**Primary Dependencies**: новых зависимостей нет. Rust — фичи `windows-sys`: `Win32_System_Console` (`AttachConsole`,
`FreeConsole`, `GetConsoleWindow`), `Win32_UI_WindowsAndMessaging` (`GetAncestor`, `SetForegroundWindow`, `ShowWindow`,
`IsIconic`, `GetClassNameW`, `GetWindow`); остальное есть. Фронт — DnD на нативном HTML5 Drag and Drop, анимации — Web
Animations API, значок Chrome — inline SVG. Внешние программы: `claude`, `code` (VS Code, в PATH), `explorer.exe`.

**Storage**: zustand `persist` `echo-workbench` → версия 3 (`mode`, `projectLayouts`, `hiddenProjects`); чужие файлы —
только чтение (`~/.claude/state/sessions/*.json`). Конфиг Claude Code и файлы проектов не пишутся.

**Testing**: `cargo test` (worktree в сканере, завершённые внешние сессии, `projects-root` в классификаторе, разбор
результата поиска окна), Vitest (детектор agent view, миграция стора v2→v3, распределение вкладок по ячейкам, перенос
вкладки, группировка процессов под сессиями, пункты меню по контексту); живые сценарии — quickstart.md.

**Target Platform**: Windows 11.

**Project Type**: desktop-app (Tauri).

**Performance Goals**: поповер/фокус окна ≤ 300 мс после клика; agent view скрыт ≤ 1 с; анимации меню 200/150 мс; DnD
без задержки (нативный).

**Constraints**: AM 2.0, Smart Control, Kockers DS не трогаются; чужие сессии и dev-серверы (см. ORCHESTRATION-006 «Нельзя
трогать») не останавливаются; процессы — только действием пользователя.

**Scale/Scope**: те же ~45 проектов, до 10 сессий; раскладок на проект — по числу открытых проектов.

## Constitution Check

| Принцип | Соответствие |
|---------|--------------|
| I. Конфиг — собственность пользователя | Пишем только свой стор; файлы хука и конфиг Claude — чтение. ✅ |
| II. Guarded file access | Новые команды: `focus_session_window(pid, sessionId)` — pid только из свежего списка сессий (сверка в Rust); `open_in_vscode(path)` — только путь известного проекта (`ensure_project`). ✅ |
| III. Resilient reading | Битый файл хука пропускается, как в 005; неверный результат поиска окна → «не найдено», не ошибка. ✅ |
| IV. Responsive desktop | Поиск окна и `code` — через `spawn_blocking`; DnD нативный. ✅ |
| V. Local and private | Сети нет; `vscode://` URI открывается через shell как внешняя ссылка. ✅ |
| VI. Simplicity, Trail | Без новых зависимостей; одно меню на всё приложение; стенды не нужны (замечания к уже выбранной форме). ✅ |
| VII. User processes | «Завершить сессию» и «Стоп» — с подтверждением; фокус окна — не управление процессом. ✅ |

Нарушений нет. Повторная проверка после дизайна — без изменений.

## Project Structure

### Documentation (this feature)

```text
specs/006-workbench-v2/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ipc.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (изменяемые и новые файлы — по исполнителям)

Правило оркестрации: два исполнителя не правят один файл в одной пачке. Таблица владения:

```text
Пачка 1
  R1 «rust-core» (Rust + контракт IPC)
    src-tauri/Cargo.toml                       (фичи windows-sys)
    src-tauri/src/workbench/window.rs          НОВЫЙ: поиск и фокус окна по pid
    src-tauri/src/workbench/sessions.rs        завершённые внешние сессии из файлов хука
    src-tauri/src/workbench/projects.rs        worktree (.git — файл) не проект
    src-tauri/src/workbench/processes.rs       правило projects-root
    src-tauri/src/workbench/mod.rs             pub mod window
    src-tauri/src/commands/workbench.rs        focus_session_window, open_in_vscode
    src-tauri/src/lib.rs                       регистрация команд
    src/lib/ipc.ts, src/lib/types.ts           новые функции и типы (единственный владелец в пачке 1)
  F1 «front-sessions»
    src/components/workbench/RunningList.tsx   внешняя сессия кликабельна, поповер, «Продолжить в Echo»
    src/components/workbench/SessionStrip.tsx  то же в полосе; индикатор watching; без хака marginRight
    src/components/workbench/ClaudeTerminal.tsx состояние «Отключено от сессии»
    src/components/workbench/terminals.ts      детектор agent view, state 'detached'
    src/components/workbench/Cell.tsx          «Завершить сессию» с подписью, подсказка крестика, Стоп-значок
    src/components/workbench/EmptyProject.tsx  скелетон
    src/components/ui/Popover.tsx              НОВЫЙ: поповер у якоря (анимация как у меню)
    src/components/layout/StatusBar.tsx        удалить
    src/components/layout/AppShell.tsx         useToolingWatch сюда, StatusBar убрать
    src/lib/workbench.ts (+ workbench.test.ts) detectAgentView, externalAction
    src/styles/workbench.css                   стили F1
  F2 «front-controls»
    src/components/workbench/DevCapsule.tsx    Стоп — заполненный квадрат danger
    src/components/workbench/Wall.tsx          LayoutPicker: сегментный контрол (только эта функция)
    src/components/workbench/ProjectHeader.tsx ChromeIcon, отступ сегмента
    src/components/ui/ChromeIcon.tsx           НОВЫЙ
    src/components/workbench/Processes.tsx     группы: Projects (корень), сессии внутри групп, подсказка
    src/lib/overview.ts (+ overview.test.ts)   groupProcesses → группы с подгруппами сессий
    src/components/workbench/ProjectTree.tsx   фильтр hiddenProjects
    src/state/workbench-store.ts (+ test)      hiddenProjects, hideProject/unhideProject (пачка 2 продолжит)
    src/components/layout/SettingsLayout.tsx   раздел «Рабочее место»: скрытые проекты
    src/styles/workbench-v2.css                НОВЫЙ: стили F2; импорт — в src/styles/globals.css

Пачка 2
  D «wall-v2»
    src/state/workbench-store.ts (+ test)      mode, projectLayouts, миграция v3, moveTab/reorderTab
    src/lib/workbench.ts (+ test)              раскладка проекта: распределение, перенос, освобождение ячейки
    src/components/workbench/Wall.tsx, Cell.tsx, WorkbenchLayout.tsx, SessionStrip.tsx, QuickSwitch.tsx,
    ProjectHeader.tsx, useStartSession.tsx
    src/components/workbench/useTabDrag.ts     НОВЫЙ: HTML5 DnD вкладок
    src/components/workbench/ModeSwitch.tsx    НОВЫЙ: сегмент «Проект / Пульт»
    src/styles/workbench.css

Пачка 3
  E «menu»
    src/components/ui/ContextMenu.tsx, src/lib/context-menu.ts (+ test)   Kockers-меню, подменю
    src/components/workbench/menus.ts          НОВЫЙ: сборка пунктов по контексту
    src/components/workbench/*.tsx             подключение меню (после D)
    src-tauri: open_in_vscode уже от R1; при необходимости — команды копирования нет (clipboard webview)
```

**Structure Decision**: структура 005 сохраняется; новые файлы — `window.rs`, `Popover.tsx`, `ChromeIcon.tsx`,
`workbench-v2.css`, `useTabDrag.ts`, `ModeSwitch.tsx`, `menus.ts`.

## Порядок и зависимости

1. R1 стартует первым и коммитит контракт (`ipc.ts`, `types.ts`) как можно раньше; F1 и F2 стартуют одновременно с R1
   и до переноса R1 делают пункты без IPC (F1: 3, 7, 8; F2: 4, 5, 2-фронт), затем `git merge workbench-v2`.
2. После пачки 1: ревью (adversary), проверки, перенос в `workbench-v2`, сообщение сессии пользователя «пачка 1 готова».
3. D (пачка 2) ветвится от `workbench-v2` после пачки 1. E начинает компонент меню параллельно с D (только
   `ContextMenu.tsx`, `context-menu.ts`, `menus.ts` без подключения), интеграцию по местам — после переноса D.
4. После пачки 3 — финальная живая проверка по quickstart.md, отчёт, уборка.

## Complexity Tracking

Нарушений конституции нет; таблица не нужна.
