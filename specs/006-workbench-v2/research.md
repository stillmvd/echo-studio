# Research: Рабочее место v2

## R-01. Окно внешней сессии по `claudePid`

**Decision**: Rust-команда `focus_session_window(pid, session_id)` в новом `workbench/window.rs`:

1. Сверить `pid` со свежим `claude agents --json` + файлами хука (pid должен принадлежать сессии `session_id`), иначе
   ошибка — фронт не управляет произвольными pid (принцип II).
2. Если среди предков процесса (sysinfo `parent()`, до 30 уровней) есть `Code.exe` → вернуть `vscode`; фронт открывает
   `vscode://stillmvd.claude-session-focus/focus?session=<id>` через `open` из `@tauri-apps/plugin-shell`.
3. Иначе `AttachConsole(pid)` → `GetConsoleWindow()` → `GetAncestor(hwnd, GA_ROOTOWNER)` → `FreeConsole()`. Если
   владельца нет (окно совпало с псевдоконсолью или `NULL`) → `not-found` (осиротевший `claude.exe` после закрытия
   вкладки WT — память `claude-session-status-hooks`, грабли 17.10). Иначе `IsIconic` → `ShowWindow(SW_RESTORE)`;
   `SetForegroundWindow(hwnd)`; результат `focused`.
4. `SetForegroundWindow` из процесса, который только что получил клик, разрешён системой; на отказ — вернуть
   `not-found` (фронт покажет поповер), без `AttachThreadInput`-трюков.

**Rationale**: алгоритм проверен модом Taskbar Claude Sessions (0.5.0) на четырёх сессиях WT; URI расширения — для VS
Code, где у псевдоконсоли нет владельца.

**Alternatives**: перебор окон `EnumWindows` по заголовку — заголовок сессии меняется хуком, ненадёжно; свой агент
в терминале — лишнее.

## R-02. Завершённые внешние сессии

**Decision**: `sessions::list` после слияния добавляет сессии из файлов хука, которых нет в `agents --json`, если
`updatedAt ≥ now − 1 ч`, `claudePid` не жив (sysinfo), `projectDir` внутри известного проекта. Поля: `kind: external`,
`status: exited`, `shortId: null`, `pid: null`, `exitedAt = updatedAt`. Фронт в «Запущено» показывает их после живых
(`urgency` `exited` последняя), подпись «завершена · вне оболочки», клик → `start_claude_session(projectPath,
sessionId)` (строго `--bg --resume <id>`).

**Rationale**: иначе после закрытия терминала сессия просто исчезает, а пользователь хотел бы продолжить её в Echo.
Час — достаточно для «только что закрыл», без шума старых файлов.

**Alternatives**: держать «виденные» сессии в памяти Echo — теряется после перезапуска; показывать все файлы хука —
шум из сотен старых сессий.

## R-03. Распознавание agent view

**Decision**: в `terminals.ts` у attach-терминала после каждой пачки данных (дебаунс 200 мс) проверять последние 30
строк буфера (`term.buffer.active`) функцией `detectAgentView(lines)` из `lib/workbench.ts`: маркеры — строки agent
view Claude Code (`Describe a task for a new session`, `claude agents`, `Background sessions`, строка-подсказка про
`attach`; точный набор снимается на живой сессии при реализации и фиксируется в тесте). Нашёл → `terminal_detach`,
состояние `detached` с оверлеем «Отключено от сессии · Вернуться · Завершить сессию» (кнопка «Завершить» — через тот же
`ConfirmDialog`, что «Остановить сессию» в `Cell`). Выход attach по коду (`terminal-exit`) → то же состояние.
Ctrl+C не перехватывается (передаётся как раньше: прерывание ответа).

**Rationale**: agent view рисуется в том же PTY attach-клиента, других сигналов (код выхода, OSC) нет — T021/T023 в
005. Текстовые маркеры — единственный детектор; ложное срабатывание маловероятно (строки специфичны), а цена —
лишнее «Вернуться».

**Alternatives**: `claude attach` с флагом «без agent view» — нет такого; отслеживать `agents --json` — сессия не
меняется при отсоединении.

## R-04. DnD вкладок

**Decision**: нативный HTML5 Drag and Drop. Капсула вкладки — `draggable`, `dragstart` кладёт `text/x-echo-tab` =
`{ path, key, fromCell }`; ячейка (`.wl-cell`, в режиме «Проект» — ячейка проекта) ловит `dragenter/dragover/drop`
и подсвечивается классом `drop`; полоса вкладок ловит `dragover` между капсулами и показывает указатель (`.wb-tab-ins`).
`drop` → `moveTab(key, toCell, index)`. Эффект — `move`. Изображение перетаскивания — нативное (капсула).

**Rationale**: без зависимостей (принцип VI), WebView2 поддерживает DnD; вкладок мало, точность указателя достаточна.

**Alternatives**: `@dnd-kit` — новая зависимость ради 4 ячеек; pointer-events вручную — больше кода.

## R-05. Раскладка на проект и режимы

**Decision**: стор v3: `mode: 'project' | 'wall'` (по умолчанию `project`); `projectLayouts[path] = { layout, cells:
Array<{ tabs: string[]; active?: string }> (длина 4), focus: number }`; старые `layout/cells/tabs/activeTab/focusCell`
остаются для пульта (`tabs[path]` — общий список вкладок проекта, источник истины о том, какие вкладки открыты; раскладка
проекта лишь распределяет их). Инварианты: каждая открытая вкладка проекта — ровно в одной ячейке его раскладки;
вкладка, которой нет в `tabs[path]`, из ячеек удаляется; новая вкладка → фокусная ячейка. Миграция v2→v3: для каждого
`tabs[path]` — раскладка `1x1`, все вкладки в ячейке 0, `active = activeTab[path]`. Режим «Пульт» — поведение 005 без
изменений; переключение режимов не трогает ни пульт, ни раскладки проектов. Значки раскладки в шапке проекта → только
`projectLayouts[path].layout`.

**Rationale**: пользователь хочет «у каждого проекта своя раскладка» и при этом не терять пульт; две независимые модели
проще, чем одна общая с флагами.

**Alternatives**: одна модель ячеек с режимом фильтрации — пульт ломает распределение проекта при авто-порядке.

## R-06. Меню Kockers DS

**Decision**: `ContextMenu.tsx` по `t-menu` из `css/kockers.css` (строки 212–231) и `docs/components/Menu.md`: карточка
`radius 20`, отступ 6, пункты-капсулы 36 (`13/500`, значок 14 `dim`), `hr` разделитель, опасный пункт — `danger`
последним под линией; тень `ring + sh-pop`. Анимация — WAAPI, как `Kockers.show/hide` (`js/kockers.js`, пресет `menu`):
вход 200 мс `translateY(-4px) scale(.96)` → `none`, выход 150 мс обратный с `fill: forwards`, скрытие в `finished`;
`transform-origin` — точка клика относительно меню (угол меню, ближайший к курсору); `prefers-reduced-motion` → без
анимации. Клавиатура — уже есть (стрелки, Home/End, Esc, Tab); добавить Enter/Space на пункте и возврат фокуса на
элемент, с которого открыли. Подменю «Переместить в ячейку…» — пункт с `›`, раскрывает вложенные пункты справа
(вторая `t-menu`), стрелка → входит, ← выходит. Токены Echo (`--color-*`) уже соответствуют Kockers (`tokens.css`).

**Rationale**: пользователь попросил именно Kockers-меню; существующее меню близко по форме, нужны анимация и подменю.

**Alternatives**: Radix/Floating UI — зависимости ради одного меню.

## R-07. Worktree в сканере

**Decision**: `projects::visible_dirs` пропускает папку, у которой `dir.join(".git").is_file()`; на обоих уровнях (группа
и проект). Тест: папка с файлом `.git` исключена, с каталогом `.git` — проект.

## R-08. Группировка процессов

**Decision**: Rust: правило `projects-root` в `Classifier::classify` перед `cwd`: если `normalized(cwd) == root` →
`project_path = Some(root)`, `rule: "projects-root"`; `project_of` для `live.dir == root` — тоже root (сессия
пользователя в корне). Фронт: `groupProcesses(rows, sessions)` → группы `{ key, name, memory, sessions:
Array<{ sessionId, name, status, rows }>, rows }`; строки с `row.session` — под сессией (имя/статус из
`useClaudeSessions`, нет в списке — «сессия <id8>»), остальные — плоско; группа с `key === root` подписана
«Projects (корень)». «Без проекта» — только `orphan.reason === 'no-project'`; `session-closed`/`duplicate` остаются
«висящими» в своей группе проекта, как было в 005 (в `stray`), с причиной.

**Rationale**: пользователь не понимал, чьи процессы — имя сессии отвечает на вопрос прямо.

## R-09. Скелетон и watching

**Decision**: `EmptyProject`: `isPending` запроса разговоров (или список проектов conversations не загружен) → блок
«Продолжить» с 4 строками `.wb-rr.sk` (высота `ROW`, дыхание opacity 1→.5 за 1,2 с, `prefers-reduced-motion` →
статично); после ответа — список или блок убирается. `StatusBar.tsx` удаляется; `useToolingWatch()` вызывается в
`AppShell`; в `SessionStrip` справа — `.wb-watch` (точка 8 px `--color-success`, `title="Слежу за конфигом Claude"`);
хак `marginRight` под таблетку удалён.
