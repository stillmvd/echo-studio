---
description: "Задачи фичи 005 — Рабочее место"
---

# Tasks: Рабочее место

**Input**: `specs/005-workbench/` — plan.md, spec.md, research.md (R-01…R-12, спайк attach), data-model.md,
contracts/ipc.md, quickstart.md. Форма — `.planning/WORKBENCH.md`, стенды `.planning/sketches/301-workbench/parts/*.html`
и `302-workbench-wall/parts/*.html` (размеры — `b-css.html`, `h-css.html`, сетка — `g-wall.html`).

**Tests**: юнит-тесты для чистой логики обязательны по конституции (Development Workflow) — задачи с тестами помечены
явно, тест пишется в том же файле (`#[cfg(test)]`) или рядом (`*.test.ts`). Живые сценарии — quickstart.md.

**Правила для всех задач**: без комментариев в коде (кроме TODO); файловый I/O и запуск `claude`/`git`/`cmd` — в
`spawn_blocking` (`commands/conversations.rs::blocking`); у дочерних процессов убирать переменные окружения `CLAUDE*`,
флаг `CREATE_NO_WINDOW`; битый файл портит только свой элемент (принцип III); процессы — только по действию пользователя
(принцип VII).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно параллельно (разные файлы, нет зависимостей от незакрытых задач)
- **[Story]**: US1…US7 из spec.md

---

## Phase 1: Setup

- [X] T001 Добавить зависимости: в `src-tauri/Cargo.toml` — `portable-pty`, `sysinfo` (последние стабильные), фичи `windows-sys` `Win32_System_JobObjects`, `Win32_System_Threading`, `Win32_NetworkManagement_IpHelper`, `Win32_Networking_WinSock`, `Win32_Security`, `Win32_Storage_FileSystem`, `tokio` не добавлять (есть `tauri::async_runtime`); в `package.json` — `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl` точными версиями через `pnpm add`
- [X] T002 Создать модуль `src-tauri/src/workbench/mod.rs` (подмодули из plan.md: `projects`, `git`, `sessions`, `terminal`, `dev`, `processes`, `usage`, `limits`, `watch`), `projects_root()` = `<home>/Projects`, `state_dir(app)` = `%LOCALAPPDATA%\com.stillmvd.echo-studio\workbench`, функцию `child_command(program)` → `std::process::Command` с `CREATE_NO_WINDOW` и без `CLAUDE*`/`CLAUDECODE` в окружении; подключить `mod workbench;` в `src-tauri/src/lib.rs`
- [X] T003 [P] Создать `src-tauri/src/commands/workbench.rs` (пустой модуль команд) и `pub mod workbench;` в `src-tauri/src/commands/mod.rs`
- [X] T004 [P] Добавить раздел в рейл: `AppTab` += `'workbench'` в `src/state/ui-store.ts` (миграция `migrateUiState` пропускает новое значение), первый пункт `sections` в `src/components/layout/NavRail.tsx` (значок lucide `LayoutDashboard`, подпись «Рабочее место»), ветка `activeTab === 'workbench'` в `src/components/layout/AppShell.tsx` → `WorkbenchLayout` (заготовка `src/components/workbench/WorkbenchLayout.tsx`, наполняется в T012); тест миграции в `src/state/ui-store.test.ts`

---

## Phase 2: Foundational

**⚠️ Блокирует все истории**

- [X] T005 Дерево проектов в `src-tauri/src/workbench/projects.rs` (R-05): верхний уровень — папки без `.`/`_` в начале и не из `SKIP_TOP = {_archived, _maintenance, _build}`; папка с маркером (`.git`, `package.json`, `manifest.json`, `index.html`, `CLAUDE.md`, `.gitignore`, `.vscode`) — проект без группы, иначе группа, каждая её подпапка (кроме `.`/`_`, `node_modules`, `EXCLUDE = {Breeze-main, Smart Control-main}`) — проект; внутрь проекта не заходить; сортировка по имени без учёта регистра. Типы `ProjectTree`, `ProjectGroup`, `Project` из data-model.md (`icon: string | null`, `dev: DevCommand | null`, `mcp: { profile: string | null, headless: boolean } | null`, `hasClaudeMd`, `exists`). Тесты на `tempfile`: группа/корневой проект/скрытые папки/EXCLUDE
- [X] T006 [P] Иконки в `src-tauri/src/workbench/projects.rs`: `desktop.ini` (BOM `FF FE` → UTF-16LE, иначе UTF-8) → `IconResource=…\<имя>.ico` → текст `_maintenance/folder-icons/<имя>-small.svg`; нет/битый → `None`. Тесты: UTF-16LE с BOM, UTF-8, без строки, нет svg
- [X] T007 [P] Dev-команда и MCP-профиль в `src-tauri/src/workbench/projects.rs` (R-06): `package.json` → есть `src-tauri` и скрипт `tauri` → `<pm> tauri dev` (`kind: "tauri"`), иначе `dev`, иначе `start` (`kind: "web"`), иначе `None`; менеджер `pnpm-lock.yaml` → `pnpm`, `yarn.lock` → `yarn`, `bun.lock`/`bun.lockb` → `bun run`, иначе `npm run`; `.mcp.json` → `mcpServers["chrome-devtools"].args`: профиль — последний компонент `--user-data-dir=`, `headless` — есть `--headless`. Функция `dev_spawn_args(project) -> Option<Vec<String>>` для запуска — та же логика. Тесты на каждую ветку и битый JSON
- [X] T008 Команда `list_workbench_projects` в `src-tauri/src/commands/workbench.rs` + регистрация в `invoke_handler` `src-tauri/src/lib.rs`; guard `ensure_project(path)` в `workbench/projects.rs` — путь есть в текущем дереве (сравнение без учёта регистра), иначе ошибка; тест guard'а
- [X] T009 Слежение в `src-tauri/src/workbench/watch.rs` по образцу `memory/watch.rs`: корень Projects (2 уровня, дебаунс 500 мс) → `workbench://projects`; запуск из `setup` в `src-tauri/src/lib.rs`
- [X] T010 [P] Типы и IPC-обёртки на фронте: `src/lib/types.ts` (+ типы data-model.md), `src/lib/ipc.ts` (`listWorkbenchProjects`), хук `src/hooks/use-workbench.ts` (TanStack Query, инвалидация по `workbench://projects`)
- [X] T011 Стор `src/state/workbench-store.ts` (zustand + `persist`, ключ `echo-workbench`): `selectedProject`, `layout: "1x1" | "2x1" | "2x2"`, `cells`, `recency: string[]`, `seen: Record<sessionId, number>`, `collapsedGroups`; тест на значения по умолчанию в `src/state/workbench-store.test.ts`
- [X] T012 Каркас B в `src/components/workbench/WorkbenchLayout.tsx`: сайдбар 360 px («Запущено» сверху, дерево ниже, длинные имена — `truncate` + `title`), справа область проекта/пульта, полоса сессий внизу; размеры и классы — из `301-workbench/parts/b-css.html` в токенах `src/styles/tokens.css` и `src/styles/globals.css`
- [X] T013 Дерево в `src/components/workbench/ProjectTree.tsx`: группы со сворачиванием, строки проектов с иконкой (`<img src="data:image/svg+xml;utf8,…">`, нет — нейтральный lucide `Folder`), выбор проекта → `selectedProject`; виртуализация не нужна (< 100 строк)

**Checkpoint**: раздел открывается, дерево с иконками видно

---

## Phase 3: User Story 1 — Claude в окне (P1) 🎯 MVP

**Goal**: «Claude» на проекте → терминал с фоновой сессией в окне; закрыл/открыл Echo — сессия на месте.

**Independent Test**: quickstart.md §2.

- [X] T014 [US1] Сессии в `src-tauri/src/workbench/sessions.rs`: `run_agents()` — `claude agents --json` через `child_command`, разбор массива (`id`, `pid`, `cwd`, `kind`, `sessionId`, `name`, `status`), битый элемент пропускается; `read_hooks()` — `~/.claude/state/sessions/*.json` (без `*.tmp`; поля `sessionId`, `claudePid`, `projectDir`, `state`, `phase`, `tool`, `since`, `transcript`); `merge()` → `ClaudeSession` по data-model.md: `kind` `background` → `shell`, `interactive` → `external`; статус — `agents.status` `waiting` → `waiting`, `busy` → `working`, `idle` → хук `error` → `error`, хук `done` → `done`, иначе `idle`; **поле `agents.state` не использовать**; нет в agents → `exited`; `projectPath` — сопоставление `cwd`/`projectDir` с деревом (префикс без учёта регистра). Тесты `merge()` на фикстурах (включая свежую сессию `status=idle, state=blocked` → `idle`)
- [X] T015 [US1] Запуск в `src-tauri/src/workbench/sessions.rs`: `start(project, resume: Option<sessionId>)` — `claude --bg` (новая) или строго `claude --bg --resume <id>` **без других флагов** в папке проекта; разбор `backgrounded · <id8> · <name>` → `shortId`, `sessionId` — из `run_agents()` по `id`; вывод с «Workspace not trusted» → ошибка `untrusted`; resume разговора, который уже идёт в фоновой сессии (`sessionId` есть в agents), — вернуть её без запуска. `stop(shortId)` → `claude stop`, `forget(shortId)` → `claude rm`. Валидация: `shortId` `^[0-9a-f]{8}$`, `sessionId` — UUID. Тесты разбора вывода и валидации
- [X] T016 [US1] Команды `list_claude_sessions`, `start_claude_session`, `stop_claude_session`, `forget_claude_session` в `src-tauri/src/commands/workbench.rs` по contracts/ipc.md; регистрация в `lib.rs`
- [X] T017 [US1] Слежение за `~/.claude/state/sessions` в `src-tauri/src/workbench/watch.rs`: изменение → дебаунс 500 мс, не чаще 1/с → `run_agents()` + `merge()` → событие `workbench://sessions` с полным списком; плюс таймер 15 с, пока фронт подписан (команда `set_workbench_active(bool)`)
- [X] T018 [US1] Терминал в `src-tauri/src/workbench/terminal.rs`: `portable-pty` `native_pty_system()`, `claude attach <shortId>` через `CommandBuilder` (окружение без `CLAUDE*`), реестр `terminalId → (master, writer, child)` в `tauri::State<Mutex<…>>`; поток чтения копит байты и шлёт в `tauri::ipc::Channel<Vec<u8>>` не чаще 1 раза в 16 мс; выход child → событие `workbench://terminal-exit { terminalId, code }`; `write`, `resize(cols, rows)`, `detach` (kill только attach)
- [X] T019 [US1] Команды `terminal_attach`, `terminal_write`, `terminal_resize`, `terminal_detach` в `src-tauri/src/commands/workbench.rs`; при закрытии окна (`on_window_event` в `lib.rs`) — `detach` всех
- [X] T020 [P] [US1] Клавиши в `src/lib/workbench.ts`: `terminalKey(event, hasSelection)` → `{ send?: string, copy?: true, pass?: true }`: Shift+Enter и Alt+Enter → `"\x1b\r"`; Alt + `event.code === "KeyV"` (любая раскладка) → `"\x1bv"`; Ctrl+C с выделением → `copy`, без — штатно (`\x03`); Ctrl+Tab/Ctrl+Shift+Tab → `pass` (не терминалу). Тесты в `src/lib/workbench.test.ts`
- [X] T021 [US1] `src/components/workbench/Terminal.tsx`: xterm (`@xterm/xterm`, шрифт Geist Mono, тема из токенов), `FitAddon`, `WebglAddon` с откатом на DOM при `onContextLoss`; режим `attach` — `scrollback: 0`, `attachCustomKeyEventHandler` через `terminalKey`, ввод → `terminal_write`, `onResize` → `terminal_resize`, `onTitleChange` → название вкладки; выход attach: сессия ещё в списке (Ctrl+Z) → re-attach, иначе вкладка «завершена» с кнопкой «Продолжить» (`start_claude_session(project, sessionId)`); заголовок/экран agent view (двойная «←») → плашка «Вернуться к сессии» (re-attach)
- [X] T022 [US1] Шапка проекта `src/components/workbench/ProjectHeader.tsx`: иконка, имя, путь, кнопка «Claude» (вторая сессия рядом, первая не трогается); ошибка `untrusted` → `ConfirmDialog` «Папка не доверена» с кнопкой «Открыть в Claude» (`openInClaudeCode(path)` из `src/lib/ipc.ts`); вкладки сессий проекта — капсулы (`302-workbench-wall/parts/h-css.html`)
- [X] T023 [US1] Название вкладки (FR-016): `agents.name` → OSC-заголовок → `custom-title`/`ai-title` транскрипта (`conversations::scanner::parse_session_meta`) → «Claude»; в `src/components/workbench/Cell.tsx`
- [X] T024 [US1] Закрытие вкладки: живая сессия — только `terminal_detach`; завершённая — `forget_claude_session` (транскрипт остаётся); «Остановить сессию» в меню вкладки — `ConfirmDialog` → `stop_claude_session`; в `src/components/workbench/Cell.tsx`
- [X] T025 [US1] Edge: папка проекта исчезла при живой сессии → сессия работает, строка дерева «папки нет» (`exists: false`); после перезагрузки ПК сессии из `claude agents --json --all` с `kind: background` и завершённые показываются с «Продолжить» — проверить в quickstart §2, нет данных в `--all` → хранить открытые `sessionId` в `workbench-store` и показывать их; в `src-tauri/src/workbench/sessions.rs` и `src/components/workbench/WorkbenchLayout.tsx`

**Checkpoint**: US1 по quickstart §2, SC-001, SC-002

---

## Phase 4: User Story 2 — статусы и переход (P1)

**Goal**: видно, кто ждёт; Ctrl+Tab между всеми сессиями.

**Independent Test**: quickstart.md §3.

- [ ] T026 [P] [US2] Срочность в `src/lib/workbench.ts`: `urgency(status)` по порядку `waiting → error → working → done → idle → exited`, сортировка по срочности, внутри — по `since` (дольше ждёт выше); «готово» с отметкой `seen` после `since` → `idle`; самый срочный статус проекта и группы. Тесты
- [ ] T027 [P] [US2] `src/components/workbench/StatusIcon.tsx`: сплошной значок по статусу и `phase` (thinking/tool/agents), набор как в моде Taskbar Claude Sessions (`C:\Users\stillmvd\Projects\Windhawk Mods\Taskbar Claude Sessions`), lucide-эквиваленты, цвета из токенов
- [ ] T028 [US2] «Запущено» `src/components/workbench/RunningList.tsx`: сессии и dev-серверы по срочности; `external` — пометка «вне оболочки», без терминала; клик → открыть сессию (ручное открытие = закрепление в пульте)
- [ ] T029 [US2] Чипы в `src/components/workbench/ProjectTree.tsx` (строка B со стенда): значок самой срочной сессии + число, порт dev; свёрнутая группа — чипы своих проектов
- [ ] T030 [US2] Полоса сессий `src/components/workbench/SessionStrip.tsx`: все сессии, всегда видна; фокус ячейки отмечает `seen[sessionId] = now`
- [ ] T031 [US2] Ctrl+Tab `src/components/workbench/QuickSwitch.tsx`: перехват `keydown` на `window` в capture; список всех сессий по `recency` (недавние первыми, обновляется при фокусе вкладки), Tab — дальше, Shift+Tab — назад, `keyup` Ctrl — переход; логика `nextInRecency()` в `src/lib/workbench.ts` с тестами

**Checkpoint**: US1 + US2 — MVP, SC-003, SC-006

---

## Phase 5: User Story 3 — dev-сервер (P2)

**Goal**: dev по кнопке, порт, лог, стоп всего дерева; сервер переживает закрытие окна.

**Independent Test**: quickstart.md §4.

- [x] T032 [US3] Запуск в `src-tauri/src/workbench/dev.rs` (R-04): `cmd.exe /d /s /c <dev_spawn_args>` в папке проекта, флаги `CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB` (ошибка доступа → повтор без breakaway), stdin null, stdout+stderr → `state_dir/dev/<slug>.log` (перезапись), `FORCE_COLOR=1`; сразу `CreateJobObjectW("Local\EchoStudio.dev.<slug>")` + `AssignProcessToJobObject`; `<slug>.json` `{ projectPath, command, pid, startedAt }` temp → rename; `slug` — hex хэша пути в нижнем регистре. Уже работает → ошибка
- [x] T033 [US3] Состояние в `src-tauri/src/workbench/dev.rs`: `list()` — по каждому `<slug>.json` `OpenJobObjectW`; есть процессы (`QueryInformationJobObject` `JobObjectBasicProcessIdList`) → `running`/`starting` (`starting` до первого порта или 30 с), иначе `stopped`; поток ожидания корневого процесса, пока Echo открыт: выход с кодом ≠ 0 без «Стоп» → `error` + `exitCode`; переходы — data-model.md DevServer
- [x] T034 [US3] Порты в `src-tauri/src/workbench/dev.rs`: `GetExtendedTcpTable` (`AF_INET` и `AF_INET6`, `TCP_TABLE_OWNER_PID_LISTENER`) × pid job; опрос раз в 2 с в `starting`, затем раз в 10 с; смена → `workbench://dev`. Чистая функция `ports_for(pids, table)` с тестом
- [x] T035 [US3] Стоп в `src-tauri/src/workbench/dev.rs`: `TerminateJobObject`, затем добор — процессы с cwd или командной строкой внутри папки проекта и стартом ≥ `startedAt` (функция из `processes.rs`, T050; до неё — только job), состояние `stopped`
- [x] T036 [US3] Хвост лога в `src-tauri/src/workbench/dev.rs`: подписка → первые ≤ 2 МБ с конца, затем прирост (позиция + `notify`/опрос 200 мс) в `Channel<Vec<u8>>`; `untail_dev_log`
- [x] T037 [US3] Команды `list_dev_servers`, `start_dev_server`, `stop_dev_server`, `tail_dev_log`, `untail_dev_log`, `open_dev_server` (`http://localhost:<первый порт>` через `tauri_plugin_shell` `open`) в `src-tauri/src/commands/workbench.rs`; guard `ensure_project`
- [ ] T038 [US3] Капсула dev в `src/components/workbench/ProjectHeader.tsx` (Dev A со стенда 301): состояние, порты, «открыть», «стоп» (`ConfirmDialog`, FR-063), «запустить снова» при `error`; у проекта без `dev` — нет
- [ ] T039 [US3] Вкладка лога рядом с Claude в `src/components/workbench/Cell.tsx`: `Terminal.tsx` в режиме `log` (`disableStdin`, `scrollback: 5000`, подписка `tail_dev_log`)

**Checkpoint**: US3 по quickstart §4

---

## Phase 6: User Story 4 — пульт (P2)

**Goal**: сетка 1×1/2×1/2×2, ждущие сами выходят в ячейки.

**Independent Test**: quickstart.md §5.

- [ ] T040 [P] [US4] `arrangeCells(cells, sessions, now, focus)` в `src/lib/workbench.ts` по правилам пульта `.planning/WORKBENCH.md`: приоритет `waiting → error → working → done → idle`, внутри — дольше ждёт выше; новая ждущая занимает ячейку незакреплённой, не ручной, без ввода/прокрутки за последние 3 с, с самым низким приоритетом; вытесненные → `offGrid`; ячейка под рукой не двигается, `pendingCount` = ждущие вне сетки. Тесты: 2×2 + пять сессий, ячейка под рукой, булавка, ручное открытие
- [ ] T041 [US4] `src/components/workbench/Wall.tsx`: сетка по `layout` (`302-workbench-wall/parts/g-wall.html`), три значка раскладки в шапке, смена раскладки не пересоздаёт терминалы (ключи по `terminalId`), ждущая ячейка — значок «ждёт тебя» и рамка акцента
- [ ] T042 [US4] `src/components/workbench/Cell.tsx`: шапка ячейки — проект, капсулы вкладок (Claude-сессии и лог dev), «+», булавка; переключение вкладок не останавливает процессы; `lastInputAt` обновляется на ввод и прокрутку
- [ ] T043 [US4] «Вне сетки» и «ещё ждут: N» в `src/components/workbench/SessionStrip.tsx`

**Checkpoint**: US4 по quickstart §5

---

## Phase 7: User Story 5 — продолжить разговор (P2)

**Independent Test**: quickstart.md §6.

- [x] T044 [P] [US5] `first_reply` в `src-tauri/src/conversations/scanner.rs` `parse_session_meta`: первая строка первого текстового блока ответа ассистента, обрезка до 120 символов; поле в `SessionMeta` (`src-tauri/src/conversations/models.rs`) и в `src/lib/types.ts`; тест в `scanner.rs`
- [ ] T045 [US5] `src/components/workbench/EmptyProject.tsx` (Пустой B): «Новая сессия Claude», «запустить dev», список разговоров проекта (`listConversationSessions`, последние сверху, ограниченная высота, прокрутка, виртуализация `@tanstack/react-virtual`), строка — время + название или `first_reply`; клик → `start_claude_session(project, sessionId)` (уже открыт → переход к живой сессии, FR-051)

---

## Phase 8: User Story 6 — Обзор (P3)

**Independent Test**: quickstart.md §7 (плитки, токены, git).

- [x] T046 [US6] Мост лимитов в `~/.claude/statusline.sh` (одобрено пользователем 2026-10-20): после разбора `.rate_limits` (строки ~201–215) при `has_stdin_rates=true` писать `%TEMP%/claude-memory/rate-limits.json` `{"five_hour":{"used_percentage","resets_at"},"seven_day":{…},"updatedAt":<epoch>}` через `.tmp` → `mv -f`, как мост `ctx-<session>.json` (строки ~130–134); перед правкой — копия файла рядом `statusline.sh.bak-20261020`
- [x] T047 [P] [US6] `src-tauri/src/workbench/limits.rs`: чтение `rate-limits.json` → `RateLimits` (файла нет → `null`, `resets_at` в прошлом → «сброшен»), слежение → `workbench://limits`; `src-tauri/src/workbench/usage.rs` — порт `.planning/sketches/301-workbench/usage.cjs` (7 дней по mtime, `input + output + cache_creation`, дедупликация по `message.id`, проект по `cwd`, `today`, `days`), кэш по `(путь, mtime, размер)`, чтение через `conversations::reader::jsonl_lines`; `src-tauri/src/workbench/git.rs` — `git -C <p> status --porcelain=v1 -b`, разбор как `extract.cjs` (`branch`, `dirty`, `ahead`, `behind`, `upstream`), до 4 параллельно. Тесты: разбор git-заголовков, сумма usage на фикстуре, лимиты
- [X] T048 [US6] Команды `read_rate_limits`, `read_usage`, `read_git_states` в `src-tauri/src/commands/workbench.rs`; чип git в `ProjectHeader.tsx` (ветка, незакоммиченное, незапушенное) и чип MCP-профиля (имя, фоновый/видимый)
- [x] T049 [US6] `src/components/workbench/Overview.tsx` (Обзор A): пункт «Обзор» вверху дерева; плитки — лимит 5 ч и неделя (проценты, сброс; нет данных — «нет данных»), токены сегодня, запущено сессий/dev; таблица проектов — «сейчас», токены за 7 дней, git; обновление при открытии и раз в 60 с

---

## Phase 9: User Story 7 — процессы (P3)

**Independent Test**: quickstart.md §7 (процессы), SC-005.

- [x] T050 [US7] `src-tauri/src/workbench/processes.rs` (R-07): снимок `sysinfo` (pid, ppid, имя, командная строка, cwd, память, время старта) только для `claude.exe`, `node.exe`, `bun.exe`, `rust-analyzer.exe`, `cargo.exe`, членов dev-job и `chrome.exe` с `--user-data-dir` внутри `~/.cache/chrome-profiles`; классификация (чистая функция над снимком): член dev-job → проект; потомок живого claude (pid из agents/хука) → проект сессии; cwd внутри проекта → проект; Chrome-профиль → проект с этим `--user-data-dir` в `.mcp.json`; иначе `orphan` с причиной `session-closed` (`since` — `updatedAt` файла хука), `duplicate` (та же командная строка в том же проекте, висящим — более старый), `no-project`; `guard` — `live-session`/`running-dev`; командная строка — сокращённая, без значений `--token`/`--key`/`=…secret…`. Тесты на фикстуре `specs/005-workbench/fixtures/processes.json` + `expected.json` (готовит соседняя сессия; нет фикстуры — свои мини-фикстуры в тесте)
- [x] T051 [US7] `kill_processes(pids, confirmed)` в `src-tauri/src/workbench/processes.rs` + команды `list_processes`, `kill_processes` в `src-tauri/src/commands/workbench.rs`: свежая классификация; pid вне списка — отказ; `guard` при `confirmed = false` — отказ; Chrome-профиль и член dev-job — деревом; результат `{ killed, failed }`
- [x] T052 [US7] `src/components/workbench/Processes.tsx` (Процессы C) в Обзоре: «Без проекта» первыми с причиной, «Завершить» у строки, «Завершить все» (только перечисленные), группы по проектам с памятью; для `guard` — `ConfirmDialog`; обновление раз в 5 с, пока открыто

---

## Phase 10: Polish

- [ ] T053 [P] Узкое окно и 2×2: вкладки сжимаются с многоточием, имена проектов не наезжают (edge cases spec.md) — `Cell.tsx`, `ProjectHeader.tsx`
- [ ] T054 [P] Производительность SC-004: 8 attach + 4 лога — нет задержки ввода, окно не замирает на выводе сборки; при проблеме — увеличить пачку Channel до 32 мс и отключить WebGL у скрытых ячеек
- [ ] T055 Обновить `CLAUDE.md` проекта: раздел «Где смотреть контекст» — `specs/005-workbench/`, `.planning/WORKBENCH.md`; инварианты — фоновые сессии Claude (`--bg`, resume без флагов, доверие не ставим), dev-серверы в именованном job, процессы по принципу VII
- [ ] T056 Проверки: `pnpm biome check .` → `pnpm typecheck` → `pnpm test` → `pnpm build`; `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`, `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] T057 Пройти quickstart.md §2–§7 на живом приложении (`browser-verify`/CDP), результаты — в `.planning/WORKBENCH.md`

---

## Dependencies & Execution Order

- Setup (T001–T004) → Foundational (T005–T013) → истории.
- **US1** (T014–T025) — после Foundational; ядро для всех.
- **US2** (T026–T031) — после T014/T017 (список сессий и событие).
- **US3** (T032–T039) — после Foundational; не зависит от US1, но вкладка лога (T039) — от `Terminal.tsx` (T021) и `Cell.tsx`.
- **US4** (T040–T043) — после US1 и US2 (сессии, статусы, `Cell.tsx`).
- **US5** (T044–T045) — после T015 (resume).
- **US6** (T046–T049) — после Foundational; T048 — чипы в `ProjectHeader.tsx` (T022).
- **US7** (T050–T052) — после T014 (pid сессий) и T033 (члены job); T035 добор использует T050.
- Polish — после нужных историй.

## Parallel Opportunities

- Setup: T003, T004 параллельно после T002.
- Foundational: T006, T007, T010 параллельно с T005 (разные функции одного файла — T006/T007 после каркаса T005).
- US1: T020 (клавиши) параллельно с Rust-задачами T014–T019.
- US2: T026, T027 параллельно.
- US6: T047 параллельно с US3–US5; T046 — вне репозитория, в любой момент.
- US5 T044 — параллельно с US3/US4.

```text
# US1 параллельно:
T014–T019 (Rust: sessions.rs, terminal.rs, commands)  |  T020 (src/lib/workbench.ts + тесты)
```

## Implementation Strategy

1. **MVP** = Setup + Foundational + US1 + US2: дерево, Claude в окне, статусы, Ctrl+Tab. Проверить quickstart §2–§3,
   показать пользователю.
2. Затем US3 (dev) → US4 (пульт) → US5 (разговоры) — каждая проверяется своим разделом quickstart.
3. Затем US6 → US7.
4. Коммит — после каждой истории, только по слову пользователя, формат `feat(workbench): …`, без упоминаний AI.

## Notes

- Пункт проводника, `cc`, Windows Terminal и мод Taskbar Claude Sessions в этой фиче не меняются (FR-071).
- Конфиг Claude Code, файлы хука и транскрипты Echo не пишет (FR-070); `claude stop`/`rm` — штатные команды CLI по
  действию пользователя.

### Отклонения от формулировок (сознательные)

- T002: `state_dir` не нужен ядру — папку состояния dev держит `dev.rs` (US3).
- T005: `EXCLUDE` проверяется и на верхнем уровне — там таких папок нет, правило безвредно; поля `exists` нет — проект
  без папки определяется на фронте (`projectOf` не нашёл проект для `cwd` сессии).
- T007: функция `dev_args` (вместо `dev_spawn_args`); для npm `npm run tauri -- dev` — иначе npm не передаёт `dev`.
- T011: вместо `selectedProject` — `view` (проект или Обзор); вместо `collapsedGroups` — `openGroups` (дерево по
  умолчанию свёрнуто); `cells` добавляются с пультом (US4); `persist` с `version: 1`.
- T004: значок рейла `LayoutGrid` (`LayoutDashboard` — у пункта «Обзор»); `activeTab` по умолчанию `workbench` —
  раздел первый в рейле (FR-001).
- T014: `projectPath` сессии вычисляет фронт (`withProjects`), Rust отдаёт `cwd`; фоновая запись без `pid` и без
  `status` (мёртвая запись реестра) не считается живой.
- T015: `claude --bg` печатает `backgrounded · <id8>` с именем или с «(idle — send a prompt to start)» — разбираются оба.
- T021: имя файла `ClaudeTerminal.tsx`, экземпляры xterm живут в реестре `terminals.ts` вне React (переживают смену
  проекта и вкладки); agent view (двойная «←») не распознаётся — в ячейке есть «Переподключить»; при старте фронта
  `terminal_detach_all` снимает attach от прошлой страницы.
- T025: «папки нет» — в «Запущено» (T028); после перезагрузки ПК открытые вкладки хранит `workbench-store`, сессии
  без процесса показываются «Сессия завершена · Продолжить».
- Живая проверка US1 (2026-10-20, dev + CDP): новая сессия — вкладка 1,6 с, экран 3,2 с на прогретом демоне; первый
  `claude --bg` на холодном демоне — несколько секунд; перезапуск приложения — вкладка и экран восстановлены.
