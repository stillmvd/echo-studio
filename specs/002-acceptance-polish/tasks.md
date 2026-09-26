# Tasks: Доработки после приёмки v0.3.0

**Input**: Design documents from `specs/002-acceptance-polish/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: unit-тесты для чистой логики (`groupSkills`, разбор вопроса/ответа, конфликты в Rust). UI проверяется
через CDP и пользователем.

**Дизайн**: стенды 5 (группы skills) и 6 (карточка вопроса) — `.planning/sketches/105-skill-groups/`,
`106-ask-card/`, журнал — `.planning/TOOLING-STANDS.md`. Задача «стенд» — точка остановки до «Выбор: …».

**Режим**: автономно, локальные коммиты по фазам без push.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: User Story 5 — Ровные блоки результата (P3, самое простое — первым)

- [X] T001 [US5] `src/components/conversations/SessionViewer.tsx` `ToolStepRow`: превью `<pre>` — `line-clamp-2` вместо `max-h-[3.2em]`; сверить через CDP отступы у превью в 1/2/много строк (R1)

**Checkpoint**: коммит `fix(conversations): even padding in tool result preview`.

---

## Phase 2: User Story 2 — Дубликаты (P2)

- [X] T002 [US2] `src-tauri/src/tooling/effective.rs` `mark_conflicts`: skills плагинов входят в группы имён по короткому `name`; источник — (origin, pluginKey); тесты: user+plugin → SameName, plugin A + plugin B → SameName, один плагин — без конфликта (R3)
- [X] T003 [US2] `src/state/ui-store.ts`: `toolsDuplicatesOnly` (не persist, сброс в `setToolsScope`); `src/components/tooling/ToolList.tsx`: чип «N duplicates» в шапке рядом с «override», клик — фильтр `conflict === 'sameName'`, активное состояние чипа как у выбранного фильтра типа

**Checkpoint**: коммит `feat(tooling): duplicates across plugins with a filter chip`.

---

## Phase 3: User Story 3 — Missing-проекты (P2)

- [ ] T004 [US3] `src/lib/tooling.ts`: `samePath(a, b)` (регистр, `\`/`/`, хвостовой слэш) + тест
- [ ] T005 [US3] `src/components/tooling/ScopePanel.tsx`: live-проекты, затем группа «Missing · N» (заголовок как «Projects · N», шеврон), свёрнута по умолчанию, раскрыта при выбранном missing-проекте
- [ ] T006 [US3] `src/components/tooling/ToolList.tsx`: экран missing-проекта — путь, число сессий из `useConversationProjects` по `samePath`, «Open in Conversations» (`setConversationsProjectId` + `setActiveTab`), «No sessions» при 0

**Checkpoint**: коммит `feat(tooling): missing projects grouped with a link to sessions`.

---

## Phase 4: User Story 1 — Группы skills (P1)

- [ ] T007 [US1] `src/lib/tooling.ts`: `groupSkills(items, openKeys, query)` → `ToolRowModel[]` по data-model; тесты: плагин, префикс ≥3, одиночки, `gsd` + `gsd-next`, пустая группа скрыта, поиск раскрывает
- [ ] T008 [US1] Стенд 5 `.planning/sketches/105-skill-groups/` (генератор на базе `gen101.cjs`): варианты заголовка группы, состояния по умолчанию, отступа вложенных строк, отличия плагин/префикс; киоск на реальных skills. **Стоп до «Выбор: …»**
- [ ] T009 [US1] Записать выбор стенда 5 в `.planning/TOOLING-STANDS.md`; `ui-store` `toolsOpenGroups` (persist); `ToolList.tsx` — строки-группы в виртуализаторе при типе Skills, компонент заголовка группы по выбору стенда

**Checkpoint**: коммит `feat(tooling): skills grouped by vendor`.

---

## Phase 5: User Story 4 — Карточка вопроса (P2)

- [ ] T010 [US4] `src/lib/ask-question.ts`: `parseAsk(use, result)` → `AskCard` (R2: toolUseResult, жадное сопоставление multiSelect, свой ответ, notes, fallback по тексту, «No answer»); тесты на данных формата из логов
- [ ] T011 [US4] Стенд 6 `.planning/sketches/106-ask-card/`: варианты отметки выбора, своего ответа, multiSelect, «No answer», заметок; киоск на реальных вопросах. **Стоп до «Выбор: …»**
- [ ] T012 [US4] Записать выбор стенда 6; `src/components/conversations/AskQuestionCard.tsx` по выбору; `SessionViewer.tsx` — шаг `AskUserQuestion` рендерится карточкой; `src/lib/session-export.ts` — «вопрос → ответ» (FR-012)

**Checkpoint**: коммит `feat(conversations): ask-question card`.

---

## Phase 6: Polish

- [ ] T013 Проверки (biome, typecheck, test, build, clippy, cargo test), адверсариальный ревью (`adversary`, sonnet) на FR-001…FR-014
- [ ] T014 Версия 0.3.1 (`package.json`, `tauri.conf.json`, `Cargo.toml`); ROADMAP — строка v0.3.1; quickstart 1–5 — пользователь

## Dependencies

- Фазы 1–3 независимы; фаза 4 и 5 останавливаются на стендах (T008, T011) — пока ждём выбора по одному, делаем
  остальные фазы. T009 зависит от T007–T008, T012 — от T010–T011.
- Стенды — по одному за раз: сначала 5, затем 6.
