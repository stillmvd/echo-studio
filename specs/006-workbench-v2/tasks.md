# Tasks: Рабочее место v2

**Input**: `specs/006-workbench-v2/` — spec.md, plan.md, research.md, data-model.md, contracts/ipc.md, quickstart.md.

**Организация**: по пачкам и исполнителям из plan.md (R1, F1, F2 — пачка 1; D — пачка 2; E — пачка 3). Внутри —
по историям. Правило: два исполнителя не правят один файл в одной пачке (таблица владения — plan.md).

**Тесты**: по конституции — чистая логика с юнит-тестами (cargo test, Vitest); живые проверки — quickstart.md.

## Format: `[ID] [P?] [Story] [Исполнитель] Description`

- **[P]**: можно параллельно (разные файлы, нет зависимостей от незакрытых задач)
- **[Story]**: US1…US9 из spec.md

---

## Phase 1: Setup

- [ ] T001 Создать ветки исполнителей от `workbench-v2`: `v2-rust`, `v2-front-sessions`, `v2-front-controls` в
      worktree `.claude/worktrees/v2-<имя>`; записать в `.planning/ORCHESTRATION-006.md` раздел «Журнал» (координатор)

---

## Phase 2: Foundational — контракт IPC (R1, блокирует п. 1 и п. 6 на фронте)

- [ ] T002 [R1] Добавить в `src/lib/types.ts`: `exitedAt: number | null` в `ClaudeSession`, `root: string` в
      `ProjectTree`, `type FocusResult = 'focused' | 'vscode' | 'not-found'`; в `src/lib/ipc.ts`:
      `focusSessionWindow(pid, sessionId): Promise<FocusResult>` (`invoke('focus_session_window', { pid, sessionId })`),
      `openInVscode(path): Promise<void>`. Закоммитить отдельным коммитом `feat(workbench): IPC contract for v2`
      первым — F1/F2 мерджат его

**Checkpoint**: контракт в `workbench-v2`; F1 и F2 делают `git merge workbench-v2`

---

## Phase 3: User Story 1 — Сессия вне оболочки (P1)

**Goal**: клик по внешней сессии в «Запущено» и полосе → окно вперёд / поповер / «Продолжить в Echo».

**Independent Test**: quickstart.md §1.

- [ ] T003 [P] [US1] [R1] `src-tauri/src/workbench/window.rs` (новый, `pub mod window` в `workbench/mod.rs`):
      `pub fn focus(pid: u32) -> Focus` (`enum Focus { Focused, Vscode, NotFound }`, `Serialize` kebab-case):
      предки через `sysinfo` (`parent()`, ≤ 30) содержат `code.exe` → `Vscode`; иначе `AttachConsole(pid)` →
      `GetConsoleWindow()` → `GetAncestor(hwnd, GA_ROOTOWNER)` → `FreeConsole()`; владелец `NULL` или равен исходному
      окну → `NotFound`; `IsIconic` → `ShowWindow(SW_RESTORE)`; `SetForegroundWindow` вернул 0 → `NotFound`. Фичи
      `windows-sys` в `src-tauri/Cargo.toml`: `Win32_System_Console`, `Win32_UI_WindowsAndMessaging`. Тест: `focus`
      на `std::process::id()` своего теста не паникует и возвращает `NotFound` или `Focused`
- [ ] T004 [US1] [R1] `src-tauri/src/workbench/sessions.rs`: `pub fn session_pid(session_id) -> Result<u32>` — pid из
      `run_agents()` (по `sessionId`) или файла хука (`claudePid`), сверка `is_session_id`; `exited_external(hooks,
      agents, tree, now) -> Vec<ClaudeSession>` — файлы хука с `updatedAt ≥ now − 3600 с`, `sessionId` нет среди живых
      agents, `claudePid` не жив (`sysinfo::System::process`), `projectDir` внутри проекта дерева (`project_for`) →
      `kind: External`, `status: Exited` (новый вариант `Status::Exited`), `exited_at: Some(updatedAt)`, `short_id:
      None`, `pid: None`, `cwd: projectDir`; `list()` = `merge(...)` + `exited_external(...)`. `HookState` += `updated_at`.
      Тесты: `exited_external` на фикстурах (свежий/старый/живой pid/вне проектов)
- [ ] T005 [US1] [R1] `src-tauri/src/commands/workbench.rs`: `focus_session_window(pid: u32, session_id: String) ->
      Result<window::Focus>`: `blocking` → `sessions::session_pid(&session_id)? == pid` иначе ошибка «pid is not the
      session's claude», затем `window::focus(pid)`; регистрация в `src-tauri/src/lib.rs`
- [X] T006 [P] [US1] [F1] `src/components/ui/Popover.tsx` (новый): `Popover({ anchor: HTMLElement | null, open,
      onClose, children })` — карточка `radius 20`, тень как у меню, позиция у якоря (снизу, не выходит за окно),
      закрытие по клику мимо/Esc/blur/resize, вход 200 мс `translateY(-4px) scale(.96)`, выход 150 мс через
      `element.animate`, `hidden` в `finished`; `prefers-reduced-motion` — без анимации; `role="dialog"`,
      фокус внутрь и возврат
- [X] T007 [US1] [F1] `src/lib/workbench.ts`: `externalAction(s: ClaudeSession): 'focus' | 'resume' | 'none'` —
      `external` + живая → `focus`; `external` + `exited` + `projectPath` → `resume`; иначе `none`; `runningItems` —
      `exited` в конце; тест в `src/lib/workbench.test.ts`
- [X] T008 [US1] [F1] `src/components/workbench/RunningList.tsx`: строка внешней сессии всегда активна (`disabled`
      убрать); клик → `openExternal(s, anchor)` из нового `src/components/workbench/externalSession.tsx`: `focus` →
      `focusSessionWindow(s.pid, s.sessionId)`; `vscode` → `open('vscode://stillmvd.claude-session-focus/focus?session=<id>')`
      (`@tauri-apps/plugin-shell`); `not-found`/ошибка → `Popover` у строки: «Сессия открыта в терминале вне Echo»,
      текст «Окно не нашлось — возможно, вкладка терминала закрыта, а процесс ещё жив», кнопки «Копировать id»
      (`navigator.clipboard`), «Открыть папку» (`revealInExplorer(cwd)`); `resume` → `start(projectPath, sessionId)`
      через `useStartSession` (пробросить `onStart` в `RunningList` из `WorkbenchLayout` — F1 владеет
      `WorkbenchLayout.tsx` только для этой строки; согласовать с F2 — F2 `WorkbenchLayout.tsx` не трогает);
      подпись «завершена · вне оболочки»; сессия без проекта — подсказка «папка не из списка проектов — продолжить в
      Echo нельзя»
- [X] T009 [US1] [F1] `src/components/workbench/SessionStrip.tsx`: чип внешней сессии — тот же `openExternal`;
      завершённые внешние — в конце полосы с приглушённым стилем `.wb-bp.ext`

**Checkpoint**: quickstart §1.

---

## Phase 4: User Story 3 — Отключение от сессии (P1)

**Independent Test**: quickstart.md §3.

- [X] T010 [P] [US3] [F1] `src/lib/workbench.ts`: `detectAgentView(lines: string[]): boolean` — маркеры agent view
      (снять на живой сессии: `claude attach` после `/exit`; ожидаемые — «Describe a task», «Background sessions»,
      подсказка `attach`); тест с примером экрана в `workbench.test.ts`
- [X] T011 [US3] [F1] `src/components/workbench/terminals.ts`: `TermState` += `'detached'`; в `connect` на каждую
      пачку данных — дебаунс 200 мс → последние 30 строк `term.buffer.active` → `detectAgentView` → `detach(id)`,
      `setState(entry, 'detached')`; `terminal-exit` для живой сессии → `'detached'` (вместо `'ended'` — `'ended'`
      остаётся для завершённых); `reattach` из `'detached'` работает
- [X] T012 [US3] [F1] `src/components/workbench/ClaudeTerminal.tsx`: оверлей `.wb-term-note.dt` для `'detached'`:
      «Отключено от сессии» + кнопки «Вернуться» (`reattach`) и «Завершить сессию» (`onStop` проп → `ConfirmDialog`
      в `Cell`); для `'error'` — прежний текст с «Подключить»
- [X] T013 [US3] [F1] `src/components/workbench/Cell.tsx`: кнопка «Остановить сессию» → `wb-btn` с заполненным
      квадратом danger и подписью «Завершить сессию» (`title="Завершить сессию Claude (с подтверждением)"`); крестик
      вкладки — `title="Скрыть вкладку — сессия продолжит работать"`; `onStop` в `ClaudeTerminal`; текст
      `ConfirmDialog`: «Завершить сессию?», «Claude завершит работу. Разговор сохранится — его можно продолжить из
      списка проекта.»
- [X] T014 [US3] [F1] `src/styles/workbench.css`: `.wb-term-note.dt`, `.wb-stop` (заполненный квадрат
      `--color-danger`, hover — `--color-danger-soft` фон), `.wb-bp.ext`

**Checkpoint**: quickstart §3, включая Ctrl+C.

---

## Phase 5: User Story 6 и watching — Пустой проект, индикатор (P3, P2)

- [X] T015 [P] [US6] [F1] `src/components/workbench/EmptyProject.tsx`: `pending = !convProjects || (convId && isPending)`
      → блок «Продолжить» с 4 `<span className="wb-rr sk" />` высотой `ROW`; блок скрывается только при `!pending &&
      sessions.length === 0`; стили `.wb-rr.sk` (дыхание opacity 1→.5 за 1,2 с, `@media (prefers-reduced-motion)` —
      статично) в `src/styles/workbench.css`
- [X] T016 [P] [US4] [F1] watching: удалить `src/components/layout/StatusBar.tsx`; в `src/components/layout/AppShell.tsx`
      вызвать `useToolingWatch()` и убрать `<StatusBar />`; в `src/components/workbench/SessionStrip.tsx` удалить
      `useLayoutEffect` с `marginRight`, после `Ctrl`/`Tab` добавить `<span className="wb-watch" title="Слежу за
      конфигом Claude — изменения подхватываются сами" />`; стиль `.wb-watch` (точка 8 px `--color-success` с мягким
      свечением) в `src/styles/workbench.css`

**Checkpoint F1**: biome, typecheck, test, build; коммиты `feat(workbench): …` по историям.

---

## Phase 6: User Story 2 — Дерево (P2)

**Independent Test**: quickstart.md §2.

- [ ] T017 [P] [US2] [R1] `src-tauri/src/workbench/projects.rs`: в `visible_dirs` пропускать папки, где
      `p.join(".git").is_file()`; `ProjectTree` += `root: String`; тест `worktree_folder_is_skipped` (файл `.git` →
      нет; каталог `.git` → проект)
- [X] T018 [P] [US2] [F2] `src/state/workbench-store.ts`: `hiddenProjects: string[]` (persist), `hideProject(path)`,
      `unhideProject(path)`; `migrateWorkbench` даёт `[]`; тест в `src/state/workbench-store.test.ts`
- [X] T019 [US2] [F2] `src/components/workbench/ProjectTree.tsx`: фильтр `hiddenProjects` (через `samePath`) для
      `roots` и `g.projects`; группа без видимых проектов не показывается
- [X] T020 [US2] [F2] `src/components/layout/SettingsLayout.tsx`: раздел «Рабочее место» → «Скрытые проекты»: список
      путей (`shortPath`) с кнопкой «Вернуть» (`unhideProject`); пусто — «Скрытых проектов нет. Скрыть можно из меню
      проекта в дереве»

(Пункт меню «Скрыть из дерева» — пачка 3, T041.)

---

## Phase 7: User Story 4 — Элементы управления (P2)

**Independent Test**: quickstart.md §4.

- [X] T021 [P] [US4] [F2] `src/components/ui/ChromeIcon.tsx` (новый): inline SVG 14×14, три сектора `#DB4437`
      `#F4B400` `#0F9D58` + центр `#4285F4` с белым кольцом, `aria-hidden`
- [X] T022 [P] [US4] [F2] `src/components/workbench/ProjectHeader.tsx`: `Globe` → `ChromeIcon` в чипе MCP; между
      `DevCapsule` и `extra` — класс-зазор `.wb-ph-sep` (вертикальная линия 1px, отступ 8)
- [X] T023 [P] [US4] [F2] `src/components/workbench/DevCapsule.tsx`: обе кнопки «Остановить» → `<Square
      fill="currentColor" />` с классом `wb-cap-i stop`, `title="Остановить dev-сервер"`; крупный режим (`large`) — то же
- [X] T024 [P] [US4] [F2] `src/components/workbench/Wall.tsx`: только `LayoutPicker` — `fieldset.wl-seg` → сегмент:
      фон `--color-bg-tertiary`, капсула, кнопки с разделителями `1px` между (`.wl-seg > button + button::before`),
      активная — `--color-bg-primary` + тень; `aria-label` на fieldset «Раскладка проекта»
- [X] T025 [US4] [F2] `src/styles/workbench-v2.css` (новый, `@import "./workbench-v2.css"` в `src/styles/globals.css`):
      `.wb-cap-i.stop`, `.wl-seg` сегмент, `.wb-ph-sep`, стили группировки процессов (T028)

---

## Phase 8: User Story 5 — Чьи процессы (P2)

**Independent Test**: quickstart.md §5.

- [ ] T026 [P] [US5] [R1] `src-tauri/src/workbench/processes.rs`: в `Classifier` поле `root_path: String`
      (нормализованный корень); `project_of(path)`: `normalized(path) == root` → `Some(root как в snapshot)` — применимо
      и к `live.dir`, и к `cwd`; правило `rule: "projects-root"` для ветки `cwd`; фикстуры
      `specs/005-workbench/fixtures/expected.json` не менять — добавить юнит-тест `root_cwd_is_projects_root_group`
- [X] T027 [P] [US5] [F2] `src/lib/overview.ts`: `groupProcesses(rows, root, sessions)` → `{ stray, groups }` по
      data-model.md: `stray` — только `orphan.reason === 'no-project'`; группы по `projectPath` (включая `root`),
      внутри — `sessions: SessionGroup[]` по `row.session` (имя из `sessions.find(sessionId).name` или
      `Claude <id8>`, статус `effectiveStatus` или `null`), `rows` — без сессии; «висящие» `session-closed`/`duplicate`
      остаются в группе проекта; `nameOf(root) === 'Projects (корень)'`; тесты в `src/lib/overview.test.ts`
- [X] T028 [US5] [F2] `src/components/workbench/Processes.tsx`: внутри группы — подзаголовок сессии `.wb-ps`
      (`StatusIcon small`, имя, память) и её строки с отступом; «Без проекта» — `title` у заголовка «Процессы, которые не
      удалось отнести ни к проекту, ни к живой сессии Claude — их можно завершать»; `ProjectIcon` для корня — lucide
      `FolderTree`; `sessions` — проп из `Overview.tsx` (`useClaudeSessions`)

**Checkpoint F2 / R1**: проверки; коммиты. Координатор: adversary-ревью пачки 1, перенос в `workbench-v2`,
quickstart §1–§6, сообщение пользователю «пачка 1 готова».

---

## Phase 9: User Story 8 и 7 — Режимы и DnD (P1, P2) — пачка 2, исполнитель D

**Independent Test**: quickstart.md §7.

- [X] T029 [US8] [D] `src/lib/workbench.ts`: типы `ProjectLayout`, `ProjectCell`; `emptyLayout()`,
      `normalizeLayout(layout, tabs: string[]): ProjectLayout` (инварианты data-model.md: каждая вкладка ровно в одной
      ячейке, лишние удаляются, новые → ячейка `focus`, `active ∈ tabs`, ячейки за `CELL_COUNT` переезжают в последнюю
      видимую); `moveTabInLayout(layout, key, toCell, index?)`; `cellOfTab(layout, key)`; тесты в `workbench.test.ts`
- [X] T030 [US8] [D] `src/state/workbench-store.ts`: `mode`, `projectLayouts`, `setMode`, `setProjectLayout(path,
      layout)`, `moveTab(path, key, toCell, index?)`, `focusProjectCell(path, index)`, `activateInCell(path, cell, key)`;
      `openTab`/`closeTab`/`activate` в режиме `project` обновляют раскладку проекта (`normalizeLayout`); `setLayout`
      остаётся для пульта; `version: 3`, `migrateWorkbench` v2→v3 по data-model.md; `partialize` += новые поля; тесты
      миграции и действий в `workbench-store.test.ts`
- [X] T031 [P] [US8] [D] `src/components/workbench/ModeSwitch.tsx` (новый): сегмент «Проект / Пульт» (`role="radiogroup"`,
      тот же стиль `.wl-seg`), подсказки «Раскладка каждого проекта своя» / «Все проекты на одном экране, ячейки
      занимают ждущие»
- [X] T032 [US8] [D] `src/components/workbench/WorkbenchLayout.tsx`: `wall = mode === 'wall'`; в режиме `project` —
      `ProjectHeader` с `LayoutPicker` проекта (`projectLayouts[path].layout`, `setProjectLayout`) и `ModeSwitch`; сетка
      ячеек проекта `wl-grid l-<layout>` из `ProjectCellView` (новый компонент в `Wall.tsx` или `Cell.tsx` по выбору D):
      каждая ячейка — `Cell` с `activeKey`/`onActivate` по раскладке проекта, `focused` = `focus === i`, пустая
      ячейка — «Свободная ячейка» + «+ Claude» + «dev» (если есть) + подсказка «Перетащите сюда вкладку»; режим `wall`
      — `Wall` как в 005 плюс `ModeSwitch` в `wl-tb`
- [X] T033 [US8] [D] `src/components/workbench/Cell.tsx`: вкладки ячейки — только `cell.tabs` (проп `keys`), не весь
      `tabs[path]`; `EmptyProject` показывается только если у проекта нет вкладок вовсе (не у пустой ячейки);
      `useStartSession`/`openTab` → фокусная ячейка
- [X] T034 [US8] [D] `src/components/workbench/SessionStrip.tsx`, `QuickSwitch.tsx`: «Вне сетки» и `pendingCount` —
      только в режиме `wall`; `openSession` в режиме `project` → `select` + `activate` (ячейка вкладки из
      `cellOfTab`); фокус терминала по ключу — та же логика
- [X] T035 [US7] [D] `src/components/workbench/useTabDrag.ts` (новый): `useTabDrag({ path, cell, key })` →
      `draggable`, `onDragStart` (`dataTransfer.setData('text/x-echo-tab', JSON)`, `effectAllowed = 'move'`);
      `useTabDrop({ path, cell })` → `onDragOver` (проверка типа, `dropEffect`), `onDragEnter/Leave` → класс `drop`,
      `onDrop` → `moveTab`; указатель между капсулами: индекс по `clientX` относительно капсул `.wb-tab`; в пульте
      сброс в ячейку другого проекта → `placeProject`-подобное переназначение ячейки (`manual: true`) + `moveTab`
- [X] T036 [US7] [D] `src/components/workbench/Cell.tsx`, `Wall.tsx`: подключить `useTabDrag`/`useTabDrop`; стили
      `.wl-cell.drop` (рамка акцента), `.wb-tab-ins` (вертикальная черта 2 px акцента между капсулами), `.wb-tab[draggable]`
      курсор `grab` в `src/styles/workbench.css`
- [ ] T037 [US7] [D] Проверка DnD на живом dev (quickstart §7.1): перенос между ячейками, внутри ячейки, в пустую,
      в пульте; записать результат в раздел «Отклонения» ниже

**Checkpoint D**: проверки; adversary-ревью; перенос; quickstart §7; сообщение «пачка 2 готова».

---

## Phase 10: User Story 9 — Контекстное меню (P2) — пачка 3, исполнитель E

**Independent Test**: quickstart.md §8.

- [ ] T038 [P] [US9] [E] `src/components/ui/ContextMenu.tsx`: тип `MenuItem` из data-model.md (пункт, подменю,
      разделитель, `disabled`, `hint`); стиль по Kockers `t-menu` (research R-06); анимация WAAPI вход/выход с
      `transform-origin` у точки клика, `hidden` в `finished`, `prefers-reduced-motion`; Enter/Space на пункте; возврат
      фокуса на элемент-источник; подменю — раскрытие справа по наведению/→/Enter, ← закрывает; `origin` проп
      `{ x, y }`; можно стартовать параллельно с D
- [ ] T039 [P] [US9] [E] `src/lib/context-menu.ts`: `menuPlacement(x, y, w, h, viewport) → { left, top, originX,
      originY }` (меню внутри окна, origin — угол у курсора); тест `src/lib/context-menu.test.ts`
- [ ] T040 [P] [US9] [E] `src/components/workbench/menus.ts` (новый): фабрики пунктов: `projectMenu({ project, server,
      actions })` — Открыть, Новая сессия Claude, Запустить/Остановить dev, Открыть в проводнике (`revealInExplorer`),
      Открыть в VS Code (`openInVscode`), Копировать путь, разделитель, Скрыть из дерева; `sessionTabMenu` —
      Переместить в ячейку… (подменю по `CELL_COUNT[layout]`, текущая `disabled`), Переподключить, Копировать id,
      Скрыть вкладку, разделитель, Завершить сессию (danger); `devTabMenu` — Открыть в браузере, Перезапустить,
      Копировать адрес (`http://localhost:<port>`), Закрыть лог, разделитель, Остановить (danger); `processMenu` —
      Копировать командную строку, Открыть папку (cwd — нет в `ProcessRow`: открыть папку проекта), разделитель,
      Завершить (danger, с подтверждением для `guard`); `runningMenu` — Перейти / Показать окно (внешняя), Копировать
      id, разделитель, Завершить (danger); тест состава пунктов по контексту в `src/components/workbench/menus.test.ts`
- [ ] T041 [US9] [E] Подключить меню: `ProjectTree.tsx` (строка проекта, `onContextMenu` + `menuPoint`), `Cell.tsx`
      (вкладки сессии и dev), `DevCapsule.tsx` (капсула), `Processes.tsx` (строка), `RunningList.tsx` (строка),
      `SessionStrip.tsx` (чип) — один хост меню в `WorkbenchLayout.tsx` (`useContextMenu` из `context-menu.ts`:
      состояние `{ items, x, y, source }`), чтобы не плодить порталы
- [ ] T042 [US9] [R1→E] `src-tauri/src/commands/workbench.rs`: `open_in_vscode(project_path)` — `ensure_project` →
      `child_command("cmd.exe").args(["/c", "code", path])` или поиск `code.cmd` в PATH; ошибка «VS Code не найден в
      PATH»; регистрация в `lib.rs` (делает R1 в пачке 1 вместе с T005, E только использует)
- [ ] T043 [US9] [E] Правило из памяти `desktop-app-peeves`: пункты меню не выделяют текст (`user-select: none` уже
      глобально для `[role="menuitem"]` — проверить в `globals.css`, добавить при отсутствии), вдавливание пункта
      `scale .98` при `:active`

**Checkpoint E**: проверки; adversary; перенос; quickstart §8; сообщение «пачка 3 готова».

---

## Phase 11: Polish

- [ ] T044 Координатор: полный quickstart.md §1–§8 на dev из `v2-integration`; результаты — в раздел «Живые проверки»
      `.planning/WORKBENCH.md`
- [ ] T045 Координатор: `CLAUDE.md` проекта — инварианты v2 (внешние сессии: фокус окна по pid из свежего списка;
      worktree не проект; режимы Проект/Пульт; меню одно на приложение) — патч в `specs/006-workbench-v2/claude-md-patch.md`
      (сам CLAUDE.md правит пользователь, как в 005)
- [ ] T046 Координатор: итоговый отчёт сессии `projects-19`, уборка сессий, worktree исполнителей, cron

---

## Dependencies & Execution Order

- T002 (контракт) → T008, T028 (фронт п. 1 и п. 6 используют новые типы); F1/F2 начинают с задач без IPC.
- Пачка 2 (T029–T037) — после переноса пачки 1 (меняет те же `Cell.tsx`, `Wall.tsx`, `SessionStrip.tsx`, стор).
- T038–T040 (E) — параллельно с D; T041, T043 — после переноса D.
- T042 делает R1 в пачке 1.

## Parallel Example: пачка 1

```text
R1: T002 → T003, T017, T026 [P] → T004 → T005, T042
F1: T006, T010, T015, T016 [P] → merge workbench-v2 → T007, T008, T009, T011–T014
F2: T018, T021, T023, T024 [P] → T019, T020, T022, T025 → merge → T027, T028
```

## Отклонения от формулировок

(заполняется по ходу: что решили иначе и почему)

### F2 «front-controls»

- T023: класс кнопки «Стоп» — `wb-cap-i wb-stop` (как в разделе «Решения» spec.md), а не `wb-cap-i stop`.
- T022: разделитель `.wb-ph-sep` рисуется только когда в шапке есть и капсула dev, и `extra` (сегмент раскладки);
  без dev линия не висит в пустоте. Отступ — по брифу: 6 px с каждой стороны (`gap` шапки 12 минус `margin` −6).
- T024: в `.wl-seg` активная кнопка гасит соседние разделители, чтобы подсветка не резалась линией. Тень активной —
  `--color-press-shade` (в `workbench.css` у `.wl-seg button.on` стоит `--press-shade`, которого нет — это F1/D).
- T027: подпись корня — `groupName(path, root)` (новая функция), а не `nameOf(root)`: `nameOf` не знает корня и
  используется в `describe`. Сигнатура — `groupProcesses(rows, root, sessions, seen = {})`: `seen` нужен для
  `effectiveStatus`. `SessionGroup` дополнен `phase` и `tool` — их требует `StatusIcon`. Сессии сортируются по
  `urgency(status)` (неизвестные — в конце), при равенстве — по памяти: `byUrgency` требует полный `ClaudeSession`.
  Висящие `session-closed`/`duplicate` идут в `rows` группы проекта (не под сессией) и подсвечены цветом опасности
  (`.wb-pr.orphan`). «Завершить все висящие» — полоса над списком (`orphans(rows)`: все `orphan && !guard` из
  всех групп, как в US7 005); из заголовка «Без проекта» кнопка убрана (решение координатора по ревью).
- T028: подсказка «Без проекта» — `title` на всём заголовке и значок `CircleHelp` рядом (`title` новичок не найдёт
  без видимого значка).

### F1 front-sessions (T006–T016)

- T008/T009: `WorkbenchLayout.tsx` не тронут. «Продолжить в Echo» идёт через хук `useExternalSession`
  (`externalSession.tsx`), который сам берёт `useStartSession` и рисует его диалоги рядом с поповером, — так же работает
  и в полосе, куда `onStart` не приходит. Цена: `busy` этого запуска не гасит кнопки «Новая сессия» в ячейках.
- T009: завершённые внешние — в самом конце полосы, после «Вне сетки».
- T010: маркеры сняты на Claude Code 2.1.306 своим ConPTY-хостом (`claude attach` + `/exit`, двойная «←», Ctrl+Z), не
  через dev Echo — сборка Rust запрещена по нагрузке. Agent view: строка шапки `New sessions: <модель> · <усилие>`,
  поле `❯ describe a task for a new session`, подвал `enter to return · space to reply · …`. Echo запускает attach в
  `~`, поэтому после `/exit` сначала идёт вопрос доверия к `~`: `Accessing workspace:` и `Quick safety check: Is this a
  project you created or one you trust?` — тоже маркеры. Правило: ≥ 2 маркеров, каждый с начала строки. Ctrl+Z не
  открывает agent view — attach завершается (`?1049l` и выход), это ловит `terminal-exit` → `detached`.
- T011: выход attach сразу после запуска (`earlyExits`) остаётся `ended` с авто-переподключением через 3 с, как в 005;
  `detached` — только после живого подключения. После детекции экран терминала очищается (`term.reset()`), чтобы за
  оверлеем не висел agent view.
- T012: в оверлее после «Отключено от сессии» — статус сессии (`· ждёт тебя` и т. п.), edge case из spec; оверлей по
  центру ячейки; «Вернуться» сразу отдаёт фокус терминалу.
- T013: кнопка подтверждения — «Завершить».
- T015: `.wb-empty` — сетка `2fr / auto / 3fr`: иконка и кнопки в средней строке, список — в нижней, поэтому кнопки не
  зависят ни от силуэтов, ни от длины списка, ни от его исчезновения. Силуэт — 44 px + зазор 2 = шаг `ROW` (46), как у
  настоящих строк.
- T006: фокус возвращается на якорь, только если он был внутри поповера (клик мимо по другому элементу фокус не
  отнимает).

### D «wall» (T029–T037)

- T029: кроме `normalizeLayout`/`moveTabInLayout`/`cellOfTab` — `insertTab(list, key, index)` (общая перестановка для
  ячеек проекта и для `tabs[path]` в пульте) и `showTabInLayout` (вкладка активна в своей ячейке, ячейка — фокусная).
  `index` — место вставки так, как его видно на полосе (до удаления самой вкладки).
- T030: стор хранит раскладки уже нормализованными (`openTab`/`closeTab` нормализуют в обоих режимах, чтобы
  раскладка не отставала от `tabs`); компоненты дополнительно нормализуют при чтении (`useProjectLayout`,
  `layoutOf`). Активация (`activate`, `openTab` существующей вкладки) в режиме «Проект» переводит фокус в ячейку
  вкладки — так Ctrl+Tab, «Запущено» и полоса открывают сессию там, где она лежит (T034 закрыт этим, без правок
  `openSession`). `select` в режиме «Проект» не трогает ячейки пульта; проект ставится в пульт при `setMode('wall')`
  (и при миграции — только если сохранён режим «Пульт»). Для сброса в пульте — отдельное действие
  `moveTabToWallCell(id, path, key, index?)`: ячейка → проект вкладки (`manual`, если не закреплена), её активная
  вкладка, фокус ячейки и `view`; `index` переставляет `tabs[path]` только внутри того же проекта. Сброс в
  закреплённую ячейку пульта разрешён осознанно — spec.md, Edge Cases: ячейка переходит к проекту вкладки, булавка
  остаётся.
- T030 (ревью): закрытие активной вкладки в режиме «Проект» активирует соседнюю в той же ячейке (справа, иначе слева)
  — `closeTabInLayout`; `activeTab[path]` берёт её же.
- T035/T036 (ревью): у режимов свой порядок вкладок и он не синхронизируется: в пульте перестановка меняет
  `tabs[path]` (`moveTabToWallCell`), в режиме «Проект» — `projectLayouts[path].cells[i].tabs` (`moveTab`).
- T036 (ревью): в `tauri.conf.json` у окна `dragDropEnabled: false` — иначе Tauri 2 на Windows забирает drag-drop
  себе и HTML5 `dragover`/`drop` до страницы не доходят (файловый drop в приложении не используется; окон из Rust нет).
  `.wb-btn:active` — затемнение фона (`--color-press-shade`) вместо `scale(.96)`; `user-select: none` на сегменте,
  капсулах и кнопках свободной ячейки. После «Проект/Пульт» фокус возвращается на выбранный пункт нового сегмента
  (старый размонтируется); сегмент раскладки при смене раскладки не размонтируется — фокус остаётся сам.
- T035 (ревью): `tabDragProps` вместо `useTabDrag` — функция без хуков с условным возвратом; файл — `useTabDrag.ts`.
- T031: сегмент — нативные `radio` в `label` (`fieldset.wl-seg.txt`), а не `role="radio"` на кнопках: Biome
  (`useSemanticElements`) требует `<input type="radio">`; стрелки работают нативно.
- T032/T033: сетка проекта — `ProjectGrid` в `Cell.tsx`. 1×1 рисуется без рамки ячейки, как в 005; 2×1/2×2 —
  `.wl-cell` без шапки, фокусная ячейка — тонкая рамка `.fx`. Ячейка проекта не «controlled»: держит терминалы всех
  своих вкладок (как одиночный проект в 005), активная — `cell.active`. Пустая ячейка у проекта без вкладок:
  `EmptyProject` — в фокусной, «Свободная ячейка» — в остальных.
- T033: вкладки на полосе — в порядке списка, dev больше не прибит к началу (иначе его нельзя переставить); в пульте
  порядок — `tabs[path]`.
- T036: исправлен `--press-shade` → `--color-press-shade` у `.wl-seg button.on` (замечание F2).
- T037: живая проверка DnD — у координатора (запрет `tauri dev` для исполнителей после перегрузки ПК 21.10).
