# Implementation Plan: Обзор инструментов Claude

**Branch**: `001-claude-tooling-view` | **Date**: 2026-09-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-claude-tooling-view/spec.md`

## Summary

Вкладка «инструменты» встаёт на место Memories: Rust-бэкенд сканирует конфигурацию Claude Code (skills, commands,
agents, plugins, MCP — user, project, local, plugin), собирает итог для проекта и пишет только штатные ключи
выключения (`enabledPlugins`, `skillOverrides`, `disabledMcpServers`, `disabledMcpjsonServers`) с копией файла и
атомарной заменой. Фронтенд — область слева (Global + проекты из Conversations), список с фильтром по типу и
поиском, детали элемента. EchoVault удаляется целиком первым шагом. Форма каждого компонента выбирается на
стенде (ROADMAP v0.3.0) до реализации. Подробности — [research.md](research.md).

## Technical Context

**Language/Version**: Rust (edition проекта, tauri 2), TypeScript 7 strict, React 19
**Primary Dependencies**: tauri 2, serde_json (+ фича `preserve_order`), serde_yaml, notify 8 + notify-debouncer-mini,
dirs; фронтенд — TanStack Query/Virtual, zustand, Tailwind 4, lucide-react, существующий `Markdown`
**Storage**: только файлы: конфигурация Claude Code (чтение, точечная запись) и копии в `%APPDATA%/<app id>/config-backups`
**Testing**: `cargo test` (сканеры, front matter, слияние областей, запись с сохранением порядка, защита путей),
Vitest (фильтр, поиск, группировка во фронтенде)
**Target Platform**: Windows 10/11, portable exe
**Project Type**: desktop-app (Tauri: `src-tauri/` + `src/`)
**Performance Goals**: Global ≈250 элементов < 1 с до показа; поиск ≤ 100 мс на ввод; внешнее изменение в UI ≤ 2 с
**Constraints**: запись только по явному действию, один ключ за раз; блокирующий I/O в `spawn_blocking`; секреты
MCP замаскированы; без сети
**Scale/Scope**: ~105 skills, 39 agents, 13 commands, 5 плагинов, 3 MCP глобально; ~20 проектов из Conversations
и ~50 из `~/.claude.json`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Как соблюдён | Статус |
|---------|--------------|--------|
| I. Конфиг — собственность пользователя | Запись только из переключателей; перечитать → изменить один ключ → копия в AppData (20 шт.) → temp + rename; `preserve_order`; общий `.claude/settings.json` проекта не пишется никогда (R3, R5) | PASS |
| II. Защита путей | Команды чтения файла элемента и «Show in Explorer» принимают путь только внутри разрешённых корней: `~/.claude`, `~/.claude.json`, папки известных проектов, `installPath` плагинов; запись — только в 4 вида файлов из R3 | PASS |
| III. Устойчивое чтение | Ошибка front matter / JSON — у своего элемента или источника, остальное читается; отсутствие папок — норма | PASS |
| IV. Отзывчивость | Сканы в `spawn_blocking`; список виртуализирован (TanStack Virtual уже в проекте); watcher с дебаунсом | PASS |
| V. Локально и приватно | Нет сети; маска `env`/`headers`; значения не пишутся в лог | PASS |
| VI. Простота и Trail | Один модуль `tooling/` без абстракций «на будущее»; UI — через стенды, форма не фиксируется в плане | PASS |

Пост-дизайн проверка (после Phase 1): нарушений нет, Complexity Tracking пуст.

## Project Structure

### Documentation (this feature)

```text
specs/001-claude-tooling-view/
├── spec.md
├── plan.md              # этот файл
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/ipc.md     # Phase 1 — IPC-команды и событие
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src-tauri/src/
├── tooling/                 # новый модуль
│   ├── mod.rs               # модели (ToolItem, Scope, Plugin, McpServer), экспорт
│   ├── paths.rs             # корни, нормализация путей проектов, guard разрешённых путей
│   ├── frontmatter.rs       # разбор YAML front matter из .md
│   ├── scan.rs              # skills / commands / agents в папке (user, project, plugin)
│   ├── plugins.rs           # installed_plugins.json + манифест + состав плагина
│   ├── mcp.rs               # mcpServers из ~/.claude.json, .mcp.json, плагинов
│   ├── settings.rs          # чтение слоёв настроек (user, project, local) и выключателей
│   ├── effective.rs         # итог для проекта: слияние, состояния, совпадения имён
│   ├── write.rs             # переключатели: перечитать, один ключ, копия, temp+rename
│   └── watch.rs             # notify: конфиг Claude → событие tooling://changed
├── commands/
│   ├── tooling.rs           # IPC фичи
│   ├── conversations.rs     # без изменений (источник cwd проектов)
│   └── system.rs            # минус EchoVault: reveal, write_text_file, open_in_claude_code
├── conversations/           # без изменений
└── lib.rs                   # регистрация команд, запуск watcher, без EchoVault
   (удаляются: echovault/, commands/memories.rs, state.rs, services/file_watcher.rs)

src/
├── components/tooling/      # новые компоненты; форма — по стендам
├── components/layout/
│   ├── ToolsLayout.tsx      # вместо MemoriesLayout
│   ├── NavRail.tsx, AppShell.tsx, StatusBar.tsx, SettingsLayout.tsx   # правки
├── hooks/use-tooling.ts     # TanStack Query + подписка на tooling://changed
├── lib/tooling.ts           # фильтр, поиск, группировка (чистые функции + тесты)
├── lib/ipc.ts, lib/types.ts # новые команды и типы, минус memories
└── state/ui-store.ts        # вкладка tools, выбранная область, фильтр, выбранный элемент
   (удаляются: components/memories/*, MemoriesLayout, ui/Select.tsx, хуки memories/db-watcher/reindex/settings-EchoVault,
    lib/claude-templates.ts, lib/date-range.ts — если больше нигде не используются)
```

**Structure Decision**: существующая раскладка Tauri-приложения; вся новая логика бэкенда — в одном модуле
`src-tauri/src/tooling/`, фронтенда — в `src/components/tooling/` и `src/lib/tooling.ts`.

## Фазы реализации (для /speckit-tasks)

1. **Вырезать EchoVault** (US4) — Rust, фронтенд, зависимости, Settings, статус. Приложение собирается и
   работает с Conversations и Settings; вкладка tools — заглушка.
2. **Модель чтения** (US1 бэкенд) — `tooling/` без записи и watcher: сканеры, плагины, MCP, настройки,
   итог проекта; unit-тесты на фикстурах во временной папке.
3. **Стенд 1 → раскладка вкладки** (US1): область слева, список, фильтр типов, поиск, пустые/ошибки.
   Выбор пользователя → реализация.
4. **Стенд 2 → детали элемента** (US1): skill/command/agent (markdown), MCP (подключение, маска секретов),
   plugin (состав, версия).
5. **Итог проекта** (US2): метки источника, перекрытия, «только проектное». Стенд — если нужны новые
   компоненты, иначе на базе выбора стендов 1–2.
6. **Переключатели** (US3): `write.rs` + тесты, стенд 3 (переключатель, ошибка, копии), реализация.
7. **Автообновление** (US5): `watch.rs`, фильтр шума `~/.claude.json`, инвалидация запросов.
8. **Settings** (FR-020): пути конфигурации Claude и список копий; стенд — если меняется форма секций шага 5.

## Complexity Tracking

Нарушений конституции нет.
