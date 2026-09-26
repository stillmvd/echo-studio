# Tasks: Обзор инструментов Claude

**Input**: Design documents from `specs/001-claude-tooling-view/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc.md, quickstart.md

**Tests**: конституция требует unit-тесты для чистой логики (сканеры, front matter, слияние областей, запись,
guard путей, фильтры фронтенда) — они включены. UI-тестов нет: визуально проверяет пользователь.

**Дизайн**: каждый новый компонент — через стенд (ROADMAP v0.3.0): стенд → «Выбор: …» пользователя → журнал →
реализация. Задачи «стенд» — точки остановки: без выбора пользователя следующую задачу реализации UI не начинать.
Журнал стендов фичи — `.planning/TOOLING-STANDS.md`, стенды — `.planning/sketches/1NN-<компонент>/`.

**Проверки после каждой фазы**: `pnpm biome check .`, `pnpm typecheck`, `pnpm test`, `pnpm build`; при правках Rust —
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` и
`cargo test --manifest-path src-tauri/Cargo.toml`. Коммит фазы — после «коммить» пользователя.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно параллельно (разные файлы, нет зависимостей от незавершённых задач)
- **[Story]**: US1–US5 из spec.md

---

## Phase 1: Setup

- [X] T001 Включить фичу `preserve_order` у `serde_json` в `src-tauri/Cargo.toml` (R5) и убедиться, что `cargo build` проходит
- [X] T002 [P] Создать журнал стендов `.planning/TOOLING-STANDS.md`: ссылка на ROADMAP v0.3.0, таблица «# · компонент · стенд · выбор · коммит», правило «без блока «Сейчас», только части + киоск»

---

## Phase 2: User Story 4 — Приложение без EchoVault (Priority: P1) 🎯 первым

**Goal**: в приложении нет ничего от EchoVault; рейл — вкладка tools (заглушка), Conversations, Settings.

**Independent Test**: quickstart сценарий 1 — запуск без `~/.memory`, ни одного упоминания EchoVault/memories/Reindex, `~/.memory` не создан.

- [X] T003 [US4] Удалить Rust-модуль `src-tauri/src/echovault/` целиком, `src-tauri/src/commands/memories.rs`, `src-tauri/src/state.rs`, `src-tauri/src/services/` (file_watcher EchoVault) и их `mod`/`use` в `src-tauri/src/lib.rs` и `src-tauri/src/commands/mod.rs`
- [X] T004 [US4] В `src-tauri/src/lib.rs` убрать `manage(AppState)`, запуск слежения за `index.db`, команды memories, `trigger_reindex`, `read_echovault_config` из `generate_handler!`
- [X] T005 [US4] В `src-tauri/src/commands/system.rs` удалить `read_echovault_config` и `trigger_reindex`; в `open_in_claude_code` убрать чтение конфига EchoVault (строка ~64), cwd по умолчанию — домашняя папка
- [X] T006 [US4] Удалить зависимости `rusqlite`, `sqlite-vec`, `reqwest` из `src-tauri/Cargo.toml` (оставить `serde_yaml`, `notify`, `notify-debouncer-mini`, `humantime` — проверить использование `humantime`, удалить если не нужен); `cargo clippy` и `cargo test` зелёные
- [X] T007 [P] [US4] Удалить фронтенд memories: `src/components/memories/*`, `src/components/layout/MemoriesLayout.tsx`, `src/components/ui/Select.tsx`, `src/hooks/use-memories.ts`, `src/hooks/use-memory-actions.ts`, `src/hooks/use-db-watcher.ts`, `src/hooks/use-reindex.ts`, `src/lib/claude-templates.ts`, `src/lib/date-range.ts`, `src/lib/highlight.ts` (перед удалением `grep` — нет других потребителей)
- [X] T008 [US4] Почистить `src/lib/ipc.ts` и `src/lib/types.ts` от memories, backups index.db, `readEchovaultConfig`, `triggerReindex`, типов `Memory*`, `BackupInfo`, `EchoVaultConfig`
- [X] T009 [US4] В `src/state/ui-store.ts` заменить `AppTab` на `'tools' | 'conversations' | 'settings'`, удалить поля и экшены memories (`selectedMemoryId`, `status`, `pendingMemoryAction`, фильтры, `bulkSelectionIds` memories); при чтении persisted-состояния значение `'memories'` превращать в `'tools'`; обновить `src/state/ui-store.test.ts`
- [X] T010 [US4] В `src/lib/nav-history.ts` убрать `selectedMemoryId` из снимка экрана, обновить `src/lib/nav-history.test.ts`
- [X] T011 [US4] `src/components/layout/NavRail.tsx` и `src/components/layout/AppShell.tsx`: вкладка tools (значок из lucide, подпись «Tools») на месте Memories, рендер заглушки `src/components/layout/ToolsLayout.tsx` (карточка `panelCard` с текстом «Coming next»)
- [X] T012 [US4] `src/components/layout/StatusBar.tsx`: убрать `useDbWatcher`, `useReindex`, число memories и кнопку Reindex; капсула — только точка статуса без подписи «watching» (подпись появится в T045)
- [X] T013 [US4] `src/components/layout/SettingsLayout.tsx`: убрать секции EchoVault и Backups, ссылку «EchoVault ↗» в заголовке и `use-settings` EchoVault-запросы; оглавление — Claude config, Conversations; добавить секцию «Claude config» с путями `~/.claude`, `~/.claude/settings.json`, `~/.claude.json` и «Show in Explorer» (FR-020, форма — как секции шага 5); удалить `src/hooks/use-settings.ts`, если пуст
- [X] T014 [US4] Прогнать проверки и quickstart сценарий 1 в dev; `grep -ri "echovault\|memor" src src-tauri/src` — только допустимые остатки (например, `claude-mem` не касается)

**Checkpoint**: приложение без EchoVault, Conversations и Settings работают. Коммит `feat(tooling): remove EchoVault`.

---

## Phase 3: Foundational — модель чтения (блокирует US1, US2, US3, US5)

- [X] T015 Модели в `src-tauri/src/tooling/mod.rs`: `ScopeRef`, `ToolItem` (поля и значения ровно по data-model.md: `kind` ∈ `skill|command|agent|plugin|mcp`, `origin` ∈ `user|project|local|plugin`, `state` ∈ `enabled|disabled|unavailable|error`, `conflict` ∈ `none|overrides|overridden|sameName`), `ToggleTarget` (`file` ∈ `userSettings|projectLocalSettings|claudeJson`, `key` ∈ `enabledPlugins|skillOverrides|disabledMcpServers|disabledMcpjsonServers`), `ScanResult`, `SourceStatus`; `serde(rename_all = "camelCase")` (`ConfigBackup` — вместе с записью в T037)
- [X] T016 [P] `src-tauri/src/tooling/paths.rs`: корни (`~/.claude`, `~/.claude.json`, `~/.claude/plugins`), нормализация пути проекта (регистр диска, `\`, без конечного разделителя), `ensure_allowed(path, allowed_roots)` + unit-тесты (выход за корень через `..`, другой диск, симлинк не требуется)
- [X] T017 [P] `src-tauri/src/tooling/frontmatter.rs`: разбор YAML между `---` в начале `.md` через `serde_yaml`; нет блока → пустая map без ошибки; битый YAML → ошибка с текстом; + unit-тесты (CRLF, BOM, `---` внутри тела)
- [X] T018 `src-tauri/src/tooling/scan.rs`: skills (`<root>/skills/<dir>/SKILL.md`), commands (`<root>/commands/**/*.md`, подпапки → `dir:name`), agents (`<root>/agents/**/*.md`); имена и описания по R2; ошибка front matter → элемент со `state: error`; отсутствующая папка → `SourceStatus missing`; unit-тесты на временной папке
- [X] T019 `src-tauri/src/tooling/plugins.rs`: чтение `installed_plugins.json` (`plugins["name@mkt"] = [{scope, installPath, version, installedAt, lastUpdated}]`), манифест `.claude-plugin/plugin.json` (необязателен), состав через `scan.rs` + `.mcp.json` плагина + число hooks; плагин без `installPath` на диске → `unavailable`; unit-тесты
- [X] T020 `src-tauri/src/tooling/mcp.rs`: серверы из `~/.claude.json` (`mcpServers`; `projects[path].mcpServers` → origin `local`), `<project>/.mcp.json`, `.mcp.json` плагина; `transport` по `type`/наличию `url`; `declaredIn`; unit-тесты
- [X] T021 `src-tauri/src/tooling/settings.rs`: слои `~/.claude/settings.json`, `<project>/.claude/settings.json`, `<project>/.claude/settings.local.json`, `~/.claude.json` (`disabledMcpServers` глобально и в `projects[path]`); вычисление выключателей по порядку local > project > user (R4) для `enabledPlugins`, `skillOverrides`, `disabledMcpjsonServers`, `enabledMcpjsonServers`; unit-тесты на слияние
- [X] T022 `src-tauri/src/tooling/effective.rs`: `scan_global()` и `scan_project(path)` → `ScanResult`; состояния и `toggle`/`toggleHint` по таблице R3 (plugin-skills/MCP, commands, agents — без переключателя); `conflict`: agent project перекрывает user, skills/commands одноимённые в user и project → `sameName` у обоих; unit-тесты
- [X] T023 Функция `list_scopes()` в `src-tauri/src/tooling/effective.rs` (отдельного `scopes.rs` нет) = Global + объединение cwd из `conversations::scanner` и ключей `~/.claude.json › projects`, `available` по наличию папки, сортировка как в панели проектов
- [X] T024 `src-tauri/src/commands/tooling.rs`: `list_tool_scopes`, `scan_tool_scope`, `read_tool_file` (guard, `.md`/`.json`, обрезка > 512 KB с `truncatedAt`) по contracts/ipc.md, всё в `spawn_blocking`; регистрация в `src-tauri/src/lib.rs`; `reveal_in_explorer` принимает пути из разрешённых корней
- [X] T025 [P] Фронтенд-типы и IPC: `src/lib/types.ts` (ToolItem и др. из data-model.md), `src/lib/ipc.ts` (`listToolScopes`, `scanToolScope`, `readToolFile`), `src/hooks/use-tooling.ts` (TanStack Query, ключи `['tooling', …]`)
- [X] T026 [P] `src/lib/tooling.ts`: фильтр по типу, поиск по имени/описанию (без учёта регистра, подсветка — сегменты), счётчики; + `src/lib/tooling.test.ts`

**Checkpoint**: `cargo test` — модель чтения покрыта; на машине пользователя `scan_tool_scope(global)` возвращает ≈105 skills, 39 agents, 13 commands, 5 плагинов, 3 MCP.

---

## Phase 4: User Story 1 — Что у меня установлено глобально (Priority: P1) 🎯 MVP

**Goal**: вкладка tools показывает Global: список с фильтром типов, поиском и деталями элемента.

**Independent Test**: quickstart сценарии 2–3.

- [X] T027 [US1] Стенд 1 «Раскладка вкладки»: `.planning/sketches/101-tools-layout/` (генератор по образцу `006-dialogs/gen6.cjs`, без блока «Сейчас»; данные — реальный скан этой машины в `data.json`): части — панель областей, заголовок области и счётчики, фильтр типов, строка элемента (skill / plugin / MCP), поиск, пусто/загрузка/ошибка источника; состояния киоска — Global, поиск, фильтр MCP, загрузка, ошибка; публикация Artifact, строка в `.planning/TOOLING-STANDS.md` «ждёт выбора». **СТОП до выбора пользователя**
- [X] T028 [US1] Записать выбор стенда 1 в `.planning/TOOLING-STANDS.md` с расшифровкой чисел
- [X] T029 [US1] `src/components/layout/ToolsLayout.tsx` + `src/components/tooling/ScopePanel.tsx`, `ToolList.tsx` (виртуализация TanStack Virtual), `TypeFilter.tsx`, `ToolRow.tsx` по выбору стенда 1; `src/state/ui-store.ts` — `toolsScope`, `toolsType`, `toolsQuery`, `selectedToolId`; mouse4/5 через `src/lib/nav-history.ts`
- [X] T030 [US1] Стенд 2 «Детали элемента»: `.planning/sketches/102-tool-detail/`: части — шапка элемента, метаданные (путь, источник, плагин), содержимое markdown, MCP (подключение, аргументы, маска секретов), плагин (версия, состав), ошибка чтения; состояния — skill, MCP, plugin, ошибка. **СТОП до выбора пользователя**
- [X] T031 [US1] Записать выбор стенда 2 в `.planning/TOOLING-STANDS.md`
- [X] T032 [US1] `src/components/tooling/ToolDetail.tsx` (+ `McpDetail.tsx`, `PluginDetail.tsx` по выбору): текст через `readToolFile` и существующий `src/components/markdown/Markdown.tsx`; «Show in Explorer»; маска `env`/`headers` с раскрытием по клику на значение до смены элемента (R9)
- [X] T033 [US1] Замер SC-001 (Global ≈250 элементов < 1 с до показа) и SC-003 (поиск ≤ 100 мс на ввод на ≈250 элементах) в dev; проверки, адверсариальный ревью (`Agent adversary`, `model: sonnet`) на соответствие выбору стендов 1–2 и FR-001…FR-010, исправить подтверждённое; dev — пользователь смотрит сам

**Checkpoint**: MVP — обзор Global работает. Коммит `feat(tooling): global tools view`.

---

## Phase 5: User Story 2 — Что видит Claude в проекте (Priority: P2)

**Goal**: область проекта показывает итог с метками источника и совпадениями имён.

**Independent Test**: quickstart сценарий 4.

- [X] T034 [US2] Стенд 3 «Итог проекта» — только если выбор стендов 1–2 не покрывает метки источника (`user` / `project` / `local` / плагин), `conflict` и переключатель «только проектное»; иначе записать в журнал «без стенда, на базе 1–2». **СТОП до выбора, если стенд делается**
- [ ] T035 [US2] `src/components/tooling/ToolRow.tsx` и `ToolDetail.tsx`: метки источника и конфликта; `src/components/tooling/ScopeHeader` — «только проектное» (фильтр `origin ∈ {project, local}` в `src/lib/tooling.ts` + тест); недоступный проект — состояние из стенда 1
- [ ] T036 [US2] Сверка SC-002 на Breezee и Smart Control: список итога против того, что Claude Code показывает в сессии (`/mcp`, skills); расхождения — исправить в `src-tauri/src/tooling/effective.rs` с тестом

**Checkpoint**: коммит `feat(tooling): project effective view`.

---

## Phase 6: User Story 3 — Включить или выключить (Priority: P3)

**Goal**: переключатели plugins, своих skills и MCP с копией файла и атомарной записью.

**Independent Test**: quickstart сценарии 5–7.

- [X] T037 [US3] `src-tauri/src/tooling/write.rs`: `set_enabled(target, enabled)` — проверка `target` по таблице R3 (общий `<project>/.claude/settings.json` недопустим), перечитать файл, изменить один ключ (`enabledPlugins` → `true|false`; `skillOverrides` → `"off"` / удалить ключ; массивы `disabledMcpServers`/`disabledMcpjsonServers` → добавить/убрать имя без дублей), отсутствующий `settings.local.json` создать с одним ключом и проверить `git check-ignore` в проекте — если файл не игнорируется, дописать `.claude/settings.local.json` в `<project>/.git/info/exclude`, копия в `%APPDATA%/<app id>/config-backups/<slug>/<YYYYMMDD-HHMMSS>.json` (коллизия → `-2`, `-3`), хранить 20, temp → rename; отступ 2 пробела
- [X] T038 [US3] Unit-тесты `write.rs`: порядок и неизвестные ключи сохранены (diff = один ключ), копия создана, 21-я копия удаляет самую старую, ошибка записи оставляет файл нетронутым, недопустимый target отклонён
- [X] T039 [US3] IPC `set_tool_enabled`, `list_config_backups` в `src-tauri/src/commands/tooling.rs` + `src/lib/ipc.ts` + мутация в `src/hooks/use-tooling.ts` (оптимистично, откат при ошибке)
- [ ] T040 [US3] Стенд 4 «Переключатель»: `.planning/sketches/104-tool-toggle/`: части — переключатель в строке и в деталях, выключенный/недоступный элемент, подсказка «нельзя выключить», ошибка записи, «глобально / для проекта»; состояния — включено, выключено, недоступно, ошибка. **СТОП до выбора пользователя**
- [ ] T041 [US3] Записать выбор стенда 4; реализовать в `src/components/tooling/ToolToggle.tsx`, `ToolRow.tsx`, `ToolDetail.tsx`
- [X] T042 [US3] `src/components/layout/SettingsLayout.tsx`: секция «Config backups» — список `list_config_backups` (файл, дата, размер) и «Show in Explorer» (FR-020), форма — как Backups шага 5 (B)
- [ ] T043 [US3] Проверки, адверсариальный ревью на FR-011…FR-016 и принцип I конституции; quickstart 5–7 вручную пользователем

**Checkpoint**: коммит `feat(tooling): enable and disable tools`.

---

## Phase 7: User Story 5 — Список обновляется сам (Priority: P3)

**Goal**: внешние изменения конфигурации видны без перезапуска.

**Independent Test**: quickstart сценарий 8.

- [X] T044 [US5] `src-tauri/src/tooling/watch.rs`: debouncer 500 мс; рекурсивно `~/.claude/{skills,commands,agents}` и `<project>/.claude` известных доступных проектов; без рекурсии `~/.claude/settings.json`, `~/.claude/plugins/installed_plugins.json`, `~/.claude.json`, `<project>/.mcp.json`; для `~/.claude.json` — сравнить срез (`mcpServers`, `disabledMcpServers` и те же ключи в `projects[*]`) с прошлым и не слать событие без изменений; событие `tooling://changed`; запуск в `src-tauri/src/lib.rs`
- [X] T045 [US5] `src/hooks/use-tooling.ts`: подписка на `tooling://changed` → `invalidateQueries(['tooling'])`; детали удалённого элемента — состояние «удалён» (из стенда 2); `src/components/layout/StatusBar.tsx` — подпись «watching» появляется и отражает работу watcher'а
- [X] T046 [US5] Проверки; quickstart 8 в dev

**Checkpoint**: коммит `feat(tooling): live updates`.

---

## Phase 8: Polish

- [ ] T047 [P] Обновить `CLAUDE.md` проекта: убрать инварианты EchoVault (index.db, FTS5, backup index.db, config.yaml), добавить инварианты фичи (запись только штатных ключей, копии в AppData, общий settings.json проекта не пишем, guard корней)
- [ ] T048 [P] Обновить `.planning/ROADMAP.md` (v0.3.0 — статус), `.planning/STATE.md` (убрать «Plugin/skill viewer», «MCP server inspector» из backlog), README — без упоминаний Claude/Anthropic (решение A-41: нейтральные термины)
- [ ] T049 Прогон всего `quickstart.md` (1–9) пользователем; версия приложения `0.3.0` в `package.json` и `src-tauri/tauri.conf.json`

---

## Dependencies & Execution Order

- Setup (T001–T002) → US4 (T003–T014) → Foundational (T015–T026) → US1 (T027–T033) → US2 (T034–T036) →
  US3 (T037–T043) → US5 (T044–T046) → Polish.
- US4 идёт до модели чтения: вкладка tools встаёт на место Memories, а код EchoVault мешает сборке без него.
- US2, US3, US5 зависят от US1 (раскладка и детали); между собой US2 / US3 / US5 независимы, но стенды —
  последовательно, по одному выбору за раз.
- Внутри US3: T037–T038 (запись + тесты) можно делать до выбора стенда 4.

## Parallel Opportunities

- T002 параллельно с T001.
- В US4: T007 (фронтенд-удаление) параллельно с T003–T006 (Rust).
- В Foundational: T016, T017 параллельно; T025, T026 (фронтенд) параллельно с T018–T024 (Rust).
- Пока пользователь выбирает на стенде: делать Rust-задачи следующей истории (например T037–T038 во время T027).

## Implementation Strategy

- **MVP** = US4 + Foundational + US1: приложение без EchoVault и обзор Global. Показать пользователю, затем
  итог проекта (US2), переключатели (US3), автообновление (US5).
- Каждая фаза заканчивается проверками, ревью и коммитом по слову пользователя.
