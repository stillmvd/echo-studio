# Tasks: Уведомления агентов и одинаковые инструменты

**Input**: Design documents from `specs/003-agent-notices-shared-tools/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc.md, quickstart.md

**Tests**: unit-тесты для чистой логики (перекрытия и индекс копий в Rust, `parseAgentNotice`, `copiesFor` /
`alsoInProjects` / `splitInherited`). UI проверяется через CDP и пользователем.

**Дизайн**: стенды 7 (шаг агента) и 8 (одинаковые инструменты) — `.planning/sketches/107-agent-notice/`,
`108-shared-tools/`, журнал — `.planning/TOOLING-STANDS.md`. Задача «стенд» — точка остановки до «Выбор: …».
Пока ждём выбор — логика без UI (Phase 1–2).

**Режим**: автономно, локальные коммиты по фазам без push.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Логика без UI (блокирует истории)

- [X] T001 [US1] `src-tauri/src/tooling/mod.rs`: убрать `Conflict::SameName`; `ToolItem` + `overridden_by: Option<String>`, `overrides: Vec<String>` (serde camelCase, `#[serde(default)]` не нужен — всегда заполняются)
- [X] T002 [US1] `src-tauri/src/tooling/effective.rs` `mark_conflicts` по data-model.md: участники — `state == Enabled`, `origin != Plugin`, `kind != Plugin`; skills+commands одной группой по `name.to_lowercase()` с рангом skill user 4 / skill project 3 / command user 2 / command project 1; agents project 2 / user 1; MCP local 3 / project 2 / user 1; у проигравшего `overridden_by` = `"skill"` если победитель skill, а он command, иначе origin победителя (`user` → `"global"`); у победителя `overrides` — метки проигравших (`"command"` для команды при победителе-skill, иначе origin проигравшего, `user` → `"global"`); переписать тесты `plugin_skills_join_same_name_groups`, `project_effective_set` и добавить: global>project skill, skill>command, выключенный победитель — без пометок, плагин с тем же именем — без пометок
- [X] T003 [P] [US3] `src-tauri/src/tooling/copies.rs` (новый) + `mod.rs`: `ToolCopy` (data-model.md) и `list_copies(home, scopes, plugins) -> Vec<ToolCopy>` — `scan_root` по `~/.claude` (label «Global»), `<project>/.claude` каждого `available` проекта, кроме совпадающего с `~/.claude` (label — имя проекта), `installPath` установленных плагинов (label — имя плагина); для skill/command/agent с `file_path`: `DefaultHasher` по байтам → hex, mtime в мс; ошибка чтения → `hash: None, modified_ms: None`; тесты на временных папках: одинаковые файлы — равные хэши, разные — разные, плагин помечен `plugin`
- [X] T004 [US3] `src-tauri/src/commands/tooling.rs`: `#[tauri::command] list_tool_copies` через `spawn_blocking`, корни — `known_scopes(home)` и установленные плагины; регистрация в `src-tauri/src/lib.rs`; `src/lib/types.ts` `ToolCopy`, `ToolItem.overriddenBy/overrides`, `ToolConflict` без `sameName`; `src/lib/ipc.ts` `listToolCopies`; `src/hooks/use-tooling.ts` `useToolCopies()` с ключом `['tooling', 'copies']`, `staleTime: 60_000`
- [X] T005 [P] [US3] `src/lib/tooling.ts`: `copiesFor(item, copies, scopePath)`, `alsoInProjects(item, copies, scopePath)`, `copyHash(item, copies)` по data-model.md + тесты в `src/lib/tooling.test.ts`
- [X] T006 [P] [US2] `src/lib/tooling.ts`: `splitInherited(items)` → `{ own, inherited }` (own — origin `project`/`local`) + тест
- [X] T007 [P] [US4] `src/lib/agent-notice.ts` (новый): `parseAgentNotice(item: DisplayItem): AgentNotice | null` по research R4 + `agent-notice.test.ts` (origin-признак, старый лог по префиксу, без summary, битая разметка → null)
- [X] T008 [US4] `src/lib/session-feed.ts`: узел `{ type: 'agent'; key; item; notice }` в ветке `user_text` до прочих проверок; `nodeText` — summary + result; `src/lib/session-export.ts`: уведомление выгружается блоком `Agent: <summary> · <status>` с отчётом; тесты в `session-feed.test.ts`, `session-export.test.ts`

**Checkpoint**: `cargo test`, `cargo clippy`, `pnpm test`, `pnpm typecheck`; коммит `feat: claude code precedence, tool copies index, agent notice parsing`.
UI временно: `ToolRow` показывает `overriddenBy` старым чипом warn, `SessionViewer` рендерит узел `agent` как
сообщение — до стендов.

---

## Phase 2: Стенды (точка остановки)

- [X] T009 [US4] Стенд 7 «Шаг агента» — `.planning/sketches/107-agent-notice/` (генератор `gen107.cjs` на базе `001-shell/stand.template.html`, данные — уведомления сессии `7c2e3786`, фоновые команды completed/failed, монитор): части «Форма шага», «Агент / команда / прочее», «Статус», «Отчёт свёрнут/раскрыт»; публикация артефактом, запись в `.planning/TOOLING-STANDS.md`
- [X] T010 [US1] Стенд 8 «Одинаковые инструменты» — `.planning/sketches/108-shared-tools/` (генератор `gen108.cjs`, данные — итог Echo Studio и индекс копий этой машины): части «Перекрытый свой» (наверху среди своих / вложенно под победителем), «Пометка победителя», «Копии в строке» (тихий суффикс / чип / ничего), «Группа Inherited» (подпись-разделитель стенда 5 / плашка), «Also found in» (список / таблица), «Шапка» (чип «N overridden»); киоск; публикация, запись в журнал
- [X] T011 Остановка: ждать «Выбор: …» по стендам 7 и 8, записать выбор в `.planning/TOOLING-STANDS.md`

---

## Phase 3: User Story 1 — Видно, какая версия сработает (P1)

- [X] T012 [US1] `src/components/tooling/ToolRow.tsx`: пометки «Overridden by …» / «Overrides …» по стенду 8, удалить «same name»
- [X] T013 [US1] `src/state/ui-store.ts`: `toolsOverriddenOnly` вместо `toolsDuplicatesOnly` (не persist, сброс в `setToolsScope`); `src/components/tooling/ToolList.tsx`: чип «N overridden» (N — элементы с `conflict !== 'none'`) с фильтром; вложенность проигравших — по стенду 8

**Checkpoint**: CDP-проверка quickstart 1–3; коммит `feat(tooling): show which copy Claude Code runs`.

---

## Phase 4: User Story 2 — Свои не тонут в глобальных (P1)

- [X] T014 [US2] `src/state/ui-store.ts`: `toolsInheritedOpen` (persist, по умолчанию false), удалить `toolsProjectOnly` и `ProjectOnlyToggle`; `src/components/tooling/ToolList.tsx`: в области проекта строки `own`, затем группа «Inherited from Global · N» по стенду 8 (строка виртуализатора как группы skills; при типе Skills внутри — группы по вендору); авто-раскрытие при совпадениях поиска и при пустом `own`; `filterTools` без `projectOnly`

- [X] T014a [US2] `src/components/tooling/ToolList.tsx`: `Tiles` — кнопки-фильтр (`aria-pressed`, выбранная `accent-soft` + кольцо 1.5 акцентом, повторный клик → `all`, ноль — `disabled`), при `compact` — капсулы 32 «N Label» в ряд; удалить `TypeFilter.tsx`; `SearchField` — в строку имени области справа (FR-018)

**Checkpoint**: CDP-проверка quickstart 4; коммит `feat(tooling): own tools first, inherited from global in a group`.

---

## Phase 5: User Story 3 — Где ещё копия (P2)

- [X] T015 [US3] `src/components/tooling/ToolRow.tsx`: «also in N projects» по стенду 8 (только origin project/local, N из `alsoInProjects`)
- [X] T016 [US3] `src/components/tooling/ToolDetail.tsx`: секция «Also found in» по стенду 8 — места из `copiesFor`, Same/Differs/«unreadable», дата у Differs, первые 6 и «N more», «Show in folder» → `revealInExplorer(copy.filePath)`; нет мест — нет секции

**Checkpoint**: CDP-проверка quickstart 5; коммит `feat(tooling): copies of a tool in other projects`.

---

## Phase 6: User Story 4 — Отчёт агента (P2)

- [X] T017 [US4] `src/components/conversations/AgentNoticeStep.tsx` (новый) по стенду 7: описание, статус (не-completed отличается), свёрнутый отчёт через существующий `Markdown`; `SessionViewer.tsx` рендерит узел `agent`

**Checkpoint**: CDP-проверка quickstart 6; коммит `feat(conversations): background agent reports as feed steps`.

---

## Phase 7: Polish

- [X] T018 Проверки: `pnpm biome check src`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `cargo clippy --all-targets -- -D warnings`, `cargo test`
- [ ] T019 Версия 0.4.0 (`package.json`, `src-tauri/Cargo.toml`, `tauri.conf.json`), `.planning/HANDOFF.md`, `pnpm tauri build --no-bundle`; коммит `chore: bump version to 0.4.0`

## Dependencies

- T001 → T002; T003 → T004 → T005; T007 → T008.
- Phase 2 (стенды) можно собирать сразу после T002/T004 — данным нужен индекс копий.
- Phase 3–6 — после T011; истории независимы между собой, общие файлы `ToolRow.tsx`/`ToolList.tsx` — по одной
  фазе подряд.

## Parallel

- T003, T005, T006, T007 — разные файлы, без взаимных зависимостей.

## Implementation Strategy

MVP — US1 (перекрытие видно): главная ошибка пользователя. Далее US2, US3, US4 по фазам с коммитом каждой.
