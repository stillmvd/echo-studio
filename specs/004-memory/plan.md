# Implementation Plan: Память Claude Code

**Branch**: `004-memory` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/004-memory/spec.md`

## Summary

Два продукта в одном репо. **Плагин `echo-memory`** (`plugin/`, ставится из локального маркетплейса репо) —
хуки на Node `.mjs` без зависимостей поверх встроенной auto memory: Stop просит основную сессию Claude записать
итог, SessionStart даёт протокол и 3 последние сессии, PostToolUse чистит секреты, PreToolUse(Read) подмешивает
записи по `files:`, SessionEnd пишет extractive-черновик; команды `/remember` и `/reflect`. Ни демона, ни БД.
**Echo Studio** получает отдельный раздел памяти: Rust-модуль `memory/` сканирует `~/.claude/projects/*/memory`,
пишет по инвариантам проекта (копия → temp → rename, guard пути), фронтенд — список, поиск, правка, архив с
отменой, перенос, дубли и слияние. Порядок: плагин (US1 → US2, Stop проверяется на живой сессии первым), затем
Echo Studio (US3 → US4), затем P3 (US5–US8). Решения — [research.md](research.md#решения-плана).

## Technical Context

**Language/Version**: Node ≥ 20 (ESM `.mjs`, только stdlib) для плагина; Rust (tauri 2), TypeScript 7 strict,
React 19 для Echo Studio
**Primary Dependencies**: плагин — нет; Echo Studio — существующие serde_yaml, serde_json, notify 8 +
notify-debouncer-mini, humantime; фронтенд — TanStack Query/Virtual, zustand, Tailwind 4, `Markdown`, `ConfirmDialog`
**Storage**: только файлы: `~/.claude/projects/<slug>/memory/` (записи, `sessions/`, `.archive/`, `MEMORY.md`,
`.reflect.log`), состояние хуков `%TEMP%/claude-memory/<session_id>.json`, копии Echo Studio
`%APPDATA%/<app id>/memory-backups/`
**Testing**: Vitest — чистые функции плагина (`plugin/lib/*.test.mjs`: значимость, scrub, блок индекса, бюджет,
путь памяти, `files:`) и фронтенда (фильтры, поиск); `cargo test` — скан, frontmatter-патч, архив/перенос/слияние,
индекс, похожесть, guard; живая сессия — [quickstart.md](quickstart.md)
**Target Platform**: Windows 10/11; Claude Code CLI с плагинами; Echo Studio portable exe
**Project Type**: плагин Claude Code + desktop-app (Tauri: `src-tauri/` + `src/`)
**Performance Goals**: SessionStart и Stop < 200 мс (инкрементальное чтение JSONL по смещению); PreToolUse(Read)
< 100 мс; SessionEnd < 1,5 с; раздел памяти ≈30 проектов × 100 записей < 1 с; внешнее изменение в UI ≤ 2 с
**Constraints**: fail-open (любая ошибка → `exit 0`, лог в `%TEMP%/claude-memory/errors.log`); stdout хука — один
JSON; вывод SessionStart ≤ 8 000 символов; хук не трогает `MEMORY.md` вне своего блока; без сети; блокирующий I/O
Rust в `spawn_blocking`
**Scale/Scope**: ~30 проектов с auto memory, до ~100 записей и ~200 заметок сессий на проект

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Как соблюдён | Статус |
|---------|--------------|--------|
| I. Конфиг — собственность пользователя | Echo Studio пишет память только по явному действию; перед записью копия в `memory-backups` (20 на файл, общий механизм с `config-backups`), temp → rename; frontmatter патчится по ключу с сохранением порядка. Хуки плагина — по правилу для плагина (v1.1.0): только папка памяти и `%TEMP%/claude-memory/`, в `MEMORY.md` только свой блок, temp → rename | PASS |
| II. Защита путей | IPC памяти принимает пути только внутри `~/.claude/projects/*/memory` (`ensure_allowed` + проверка компонента `memory`), только `.md`; перенос — только между известными папками памяти | PASS |
| III. Устойчивое чтение | Битый frontmatter — ошибка записи, остальное видно; хуки такую запись пропускают; битая строка JSONL пропускается | PASS |
| IV. Отзывчивость | Сканы и запись в `spawn_blocking`; список записей виртуализирован; watcher `memory://changed` с дебаунсом 500 мс | PASS |
| V. Локально и приватно | Нет сети, нет стороннего LLM; телеметрии нет. Маска секретов из V относится к значениям конфига (env, токены MCP); память — текст пользователя, секреты из неё вычищает scrub хука при записи, поэтому раздел показывает текст как есть | PASS |
| VI. Простота и Trail | Плагин без зависимостей, без демона и БД; Rust-модуль без абстракций; форма раздела — на стенде до реализации | PASS |

Пост-дизайн проверка (после Phase 1): нарушений нет, Complexity Tracking пуст.

## Project Structure

### Documentation (this feature)

```text
specs/004-memory/
├── spec.md
├── plan.md              # этот файл
├── research.md          # разведка + решения плана (Phase 0)
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 — проверка на живой сессии и в приложении
├── contracts/
│   ├── hooks.md         # вход/выход хуков, команды плагина
│   └── ipc.md           # IPC-команды и событие Echo Studio
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
.claude-plugin/
└── marketplace.json         # локальный маркетплейс «echo-studio» → ./plugin

plugin/                      # плагин echo-memory
├── .claude-plugin/plugin.json
├── hooks/
│   ├── hooks.json           # Stop, SessionStart, PostToolUse, PreToolUse(Read), SessionEnd
│   ├── stop.mjs
│   ├── session-start.mjs
│   ├── post-tool.mjs        # scrub файлов памяти, handoff
│   ├── pre-read.mjs         # контекст по files:
│   └── session-end.mjs      # extractive-черновик
├── lib/                     # чистые функции + тесты рядом (*.test.mjs)
│   ├── run.mjs              # fail-open обёртка, stdin JSON, один JSON на stdout, errors.log
│   ├── paths.mjs            # папка памяти проекта (git root → slug), состояние сессии
│   ├── transcript.mjs       # инкрементальное чтение JSONL: сообщения, правки, /remember, выдержки
│   ├── frontmatter.mjs      # разбор и запись frontmatter (построчный фолбэк)
│   ├── index-block.mjs      # управляемый блок MEMORY.md, бюджет вывода
│   └── scrub.mjs            # секреты, <private>, служебные теги
├── prompts/
│   ├── summary.md           # инструкция итога (reason Stop)
│   └── protocol.md          # протокол SessionStart
└── commands/
    ├── remember.md
    └── reflect.md

src-tauri/src/
├── memory/                  # новый модуль
│   ├── mod.rs               # модели (MemoryProject, MemoryRecord, SessionNote, DuplicatePair)
│   ├── scan.rs              # проекты, записи, сессии, архив; поиск по подстроке
│   ├── index.rs             # строки MEMORY.md: убрать, добавить, перенести в «## Факты»
│   ├── write.rs             # сохранить текст, патч ключей, архив/восстановление, перенос, слияние
│   ├── dupes.rs             # похожесть (биграммы Dice) ≥ 0.72
│   └── watch.rs             # ~/.claude/projects/**/memory → memory://changed
├── tooling/write.rs         # backup(): расширение копии по исходнику, корень передаётся (config/memory)
├── tooling/frontmatter.rs   # переиспользуется для разбора
├── commands/memory.rs       # IPC фичи
└── lib.rs                   # регистрация команд, запуск watcher

src/
├── components/memory/       # список, детали/редактор, дубли, диалог слияния — форма по стенду
├── components/layout/
│   ├── MemoryLayout.tsx     # новый раздел
│   └── NavRail.tsx, AppShell.tsx   # пункт «Memory»
├── hooks/use-memory.ts      # TanStack Query + подписка на memory://changed
├── lib/memory.ts            # фильтры, поиск, группировка (+ memory.test.ts)
└── state/ui-store.ts        # AppTab 'memory', выбранный проект/запись
```

**Structure Decision**: плагин — отдельная папка `plugin/` с собственным манифестом, собирается без шагов сборки;
тесты его чистых функций гоняет общий Vitest репо (дефолтный include уже ловит `*.test.mjs`). Echo Studio —
новый модуль `memory/` по образцу `tooling/`, общий только механизм копий и разбор frontmatter.

## Порядок реализации

1. **Каркас плагина + ранняя проверка Stop.** Маркетплейс, манифест, `run.mjs`, минимальный `stop.mjs`, который
   один раз блокирует и логирует вход. На живой сессии подтвердить `stop_hook_active`, формат `/remember` в JSONL,
   путь папки памяти (quickstart §1). Результат — в research.md, до остальной работы.
2. **US1 — итог сессии**: значимость, состояние, инструкция `summary.md`, scrub (PostToolUse), `/remember`.
3. **US2 — старт**: протокол, управляемый блок `MEMORY.md`, бюджет 8 000, предупреждение > 200 строк.
4. **US3 — раздел памяти**: стенд → Rust `memory/` (скан, поиск, правка, архив, перенос, копии, watch) → UI.
5. **US4 — чистка**: дубли, слияние, закрепление, устаревание, перенос в «## Факты».
6. **P3**: US5 (правило `seen` в инструкции), US6 (`pre-read.mjs`), US7 (`session-end.mjs`), US8 (`/reflect`).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | Нарушений нет: запись хуков плагина покрыта правилом принципа I v1.1.0 | — |
