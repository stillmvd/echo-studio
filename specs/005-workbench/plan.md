# Implementation Plan: Рабочее место

**Branch**: `005-workbench` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-workbench/spec.md`; форма и правила пульта — `.planning/WORKBENCH.md`,
стенды 301/302 (`.planning/sketches/301-workbench/parts/*.html`, `302-workbench-wall/` — все размеры).

## Summary

Новый первый раздел рейла: дерево проектов `C:\Users\stillmvd\Projects`, терминалы Claude и логи dev-серверов в окне,
статусы, пульт 1×1/2×1/2×2, Ctrl+Tab, Обзор (лимиты, токены, git) и процессы по проектам.

Главное решение плана (R-01): **своего PTY-хоста нет**. Claude Code 2.1.304 сам держит фоновые сессии — `claude --bg`
запускает сессию под демоном (`daemon` + `--bg-pty-host` на named pipe), `claude attach` открывает её в терминале,
`claude agents --json` отдаёт список. Echo запускает сессии через `claude --bg` (продолжение — `--bg --resume <id>` без
флагов), а в окне показывает PTY с `claude attach`; закрытие и обновление Echo сессии не трогают. Спайк attach пройден
(research.md). Dev-серверы — отдельные процессы в именованных Job Object
с логом в файл (R-04). Статусы — файлы хука `session-status.js` + `agents --json` (R-03). Лимиты — мост в
`statusline.sh` (R-08).

## Technical Context

**Language/Version**: Rust 2021 (Tauri 2), TypeScript 7 strict + React 19.

**Primary Dependencies**: существующие (tauri 2, notify 8, serde_json, TanStack Query/Virtual, zustand,
react-resizable-panels) + новые: Rust — `portable-pty` (ConPTY для attach), `sysinfo` (процессы, cwd, память), фичи `windows-sys` `Win32_System_JobObjects`, `Win32_System_Threading`,
`Win32_NetworkManagement_IpHelper`, `Win32_Networking_WinSock`, `Win32_Security`; фронт — `@xterm/xterm`,
`@xterm/addon-fit`, `@xterm/addon-webgl`. `uuid` не нужен: `--bg` выдаёт id сам. Внешние программы: `claude`
(≥ 2.1.304, фоновые сессии), `git`, `cmd.exe`.

**Storage**: файлы. Своё — `%LOCALAPPDATA%\com.stillmvd.echo-studio\workbench\dev\<slug>.{json,log}`; стор интерфейса —
zustand `persist`. Чужое (только чтение): `~/.claude/state/sessions/*.json`, `~/.claude/projects/**/*.jsonl`,
`%TEMP%/claude-memory/rate-limits.json`, `desktop.ini`, `package.json`, `.mcp.json`, `_maintenance/folder-icons/`.

**Testing**: `cargo test` (дерево, `desktop.ini`, dev-команда, git, слияние статусов, классификация процессов, токены),
Vitest (`arrangeCells`, клавиши терминала, recency, сортировка срочности); живые сценарии — [quickstart.md](quickstart.md).

**Target Platform**: Windows 11 (ConPTY, Job Objects, `GetExtendedTcpTable`), perMachine NSIS.

**Project Type**: desktop-app (Tauri).

**Performance Goals**: клик «Claude» → готовый терминал ≤ 2 с без старта Claude (SC-001); смена статуса видна ≤ 2 с
(SC-003); 8 терминалов + 4 лога без задержки ввода (SC-004) — WebGL-рендер, пачки вывода ≤ 16 мс; `scrollback`
5 000 только у dev-лога (attach — полноэкранный, историю листает Claude).

**Constraints**: сети нет (кроме открытия адреса dev по кнопке); конфиг Claude Code, проекты и транскрипты не пишутся;
процессы запускаются и завершаются только действием пользователя; браузер пользователя и системные процессы не видны и
не трогаются.

**Scale/Scope**: ~45 проектов в 10 группах, до 10 сессий и 4 dev-серверов одновременно, ~300 транскриптов за 7 дней.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Как соблюдён | Статус |
|---------|--------------|--------|
| I. Конфиг — собственность пользователя | Раздел конфиг Claude Code не пишет. `claude stop`/`rm` — штатные команды CLI по действию пользователя, транскрипт остаётся. Мост лимитов в `~/.claude/statusline.sh` — разовая правка конфига пользователя с его согласия (2026-10-20), не приложением | PASS |
| II. Защита путей | `projectPath` — только из текущего дерева; id сессий — по формату; команда dev собирается в Rust; SVG иконок — `img` с data-URI, не HTML; CSP не меняется | PASS |
| III. Устойчивое чтение | Битый `desktop.ini`/`package.json`/`.mcp.json`/файл хука/строка JSONL/вывод `agents --json` — страдает только свой проект или строка | PASS |
| IV. Отзывчивость | Сканы, `git`, `claude agents`, токены, процессы — `spawn_blocking`; вывод PTY пачками через `Channel`; длинные списки (разговоры, процессы) виртуализированы | PASS |
| V. Локально и приватно | Сети нет; лимиты из моста, не из API; командные строки процессов сокращены, `env` не показывается | PASS |
| VI. Простота и Trail | Свой хост отвергнут в пользу демона Claude Code; без абстракций под один источник; форма — стенды 301/302 | PASS |
| VII. Процессы пользователя (1.2.0, вносится с этой фичей) | Запуск/стоп — кнопками; `kill` — только pid из свежей классификации; живая сессия и работающий dev — `ConfirmDialog`; висящие — без подтверждения (FR-063); чужие процессы не показываются | PASS |

Пост-дизайн проверка (после Phase 1): нарушений нет, Complexity Tracking пуст.

## Project Structure

### Documentation (this feature)

```text
specs/005-workbench/
├── spec.md
├── plan.md              # этот файл
├── research.md          # R-01…R-12, спайк attach
├── data-model.md
├── quickstart.md        # спайк + сценарии US1–US7
├── contracts/
│   └── ipc.md           # IPC-команды, события, мост лимитов
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src-tauri/src/
├── workbench/
│   ├── mod.rs           # общие типы, корень Projects, папка состояния
│   ├── projects.rs      # дерево, desktop.ini → SVG, dev-команда, .mcp.json профиль
│   ├── git.rs           # git status --porcelain=v1 -b
│   ├── sessions.rs      # claude agents --json + файлы хука → ClaudeSession; start/stop/rm
│   ├── terminal.rs      # portable-pty: claude attach, Channel, write/resize/detach
│   ├── dev.rs           # именованный Job Object, лог, порты, состояние
│   ├── processes.rs     # sysinfo + классификация, kill
│   ├── usage.rs         # токены за 7 дней
│   ├── limits.rs        # rate-limits.json
│   └── watch.rs         # notify: корень проектов, файлы хука, лимиты, логи → события workbench://*
├── commands/workbench.rs
└── conversations/scanner.rs   # + first_reply

src/
├── components/workbench/
│   ├── WorkbenchLayout.tsx    # каркас B: сайдбар 360 («Запущено» + дерево) + пульт + полоса
│   ├── RunningList.tsx
│   ├── ProjectTree.tsx        # строки с чипами, группы
│   ├── ProjectHeader.tsx      # git, MCP, капсула dev, раскладка, «Claude»
│   ├── Wall.tsx               # сетка 1×1/2×1/2×2
│   ├── Cell.tsx               # вкладки-капсулы, булавка
│   ├── Terminal.tsx           # xterm + attach / хвост лога
│   ├── EmptyProject.tsx       # кнопки + разговоры
│   ├── SessionStrip.tsx       # полоса, «Вне сетки», «ещё ждут: N»
│   ├── QuickSwitch.tsx        # Ctrl+Tab
│   ├── Overview.tsx           # плитки + таблица
│   ├── Processes.tsx
│   └── StatusIcon.tsx
├── hooks/use-workbench.ts
├── lib/workbench.ts           # arrangeCells, срочность, recency, клавиши терминала (+ .test.ts)
├── state/workbench-store.ts
└── components/layout/{NavRail,AppShell}.tsx   # первый пункт рейла
```

**Structure Decision**: один Rust-модуль `workbench/` по образцу `memory/` и `tooling/`, IPC — `commands/workbench.rs`;
фронт — `components/workbench/` и чистая логика в `lib/workbench.ts`.

Вне репозитория: `~/.claude/statusline.sh` — мост лимитов (одобрено); конституция 1.1.0 → 1.2.0 (принцип VII).

## Порядок (для /speckit-tasks)

1. Спайк attach — пройден 2026-10-20 (research.md).
2. P1: дерево + рейл → сессии/статусы → терминал attach → «Запущено», полоса, Ctrl+Tab.
3. P2: dev-серверы → пульт → пустой проект с разговорами.
4. P3: мост лимитов + Обзор → процессы.

## Complexity Tracking

Нарушений нет.
