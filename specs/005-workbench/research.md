# Research: Рабочее место (005)

Разведка 2026-10-20 на этой машине: Claude Code 2.1.304, Windows 11 26200, 40+ проектов в `C:\Users\stillmvd\Projects`.
Форма и правила пульта — `.planning/WORKBENCH.md`, здесь — только техника.

## R-01. Где живут сессии Claude: фоновые сессии Claude Code вместо своего хоста

**Decision**: Echo Studio не пишет свой PTY-хост. Сессию запускает `claude --bg` в папке проекта, id — из вывода
`backgrounded · <id8> · <name>` (`id8` = первые 8 символов `sessionId`, полный — из `agents --json`). Продолжение —
строго `claude --bg --resume <sessionId>` без других флагов. Терминал в окне — PTY в процессе Echo Studio с
`claude attach <id8>`. Закрыли окно → умирает только клиент attach, сессия живёт у демона Claude Code.

**Rationale** (проверено пробной сессией `echo-probe`, затем `stop` + `rm`):

- `claude --bg` печатает `backgrounded · <id8> · <name>` и сразу возвращается. Дерево процессов:
  `claude.exe daemon run --origin transient` → `claude.exe --bg-pty-host \\.\pipe\cc-daemon-<hash>-pty-<id8> 200 50 -- claude.exe --session-id <uuid> -n <name> …` → сессия.
  То есть хост, named pipe и ConPTY уже есть в Claude Code; демон `transient` выходит сам, когда сессий нет — ровно
  FR-011.
- `claude attach <id|name>` открывает сессию в текущем терминале; `logs <id>` — последний экран; `stop|kill <id>` —
  остановить (разговор сохраняется); `rm <id>` — убрать запись (транскрипт `.jsonl` остаётся — проверено);
  `respawn [--all]` — перезапустить на новой версии Claude Code.
- `claude agents --json` (TTY не нужен) — все активные сессии, и интерактивные, и фоновые:
  `{ id, pid, cwd, kind: "background"|"interactive", sessionId, name, status: "busy"|"idle", state: "blocked"|"done"|… }`;
  `--all` добавляет завершённые фоновые, `--cwd <path>` фильтрует.
- Связь с файлом хука `~/.claude/state/sessions/<sessionId>.json` (FR-015) — по `sessionId`; `claudePid` хука = `pid`
  из `agents --json`, поиск по процессам не нужен.
- Обновление Echo Studio (tauri-ship → `process::exit`, NSIS `CheckIfAppIsRunning echo-studio.exe`) сессии не задевает:
  их процессы — `claude.exe` у демона, не потомки окна.

**Alternatives considered**:

- Свой хост ConPTY (`portable-pty`) отдельным процессом + протокол по named pipe + кольцевой буфер вывода — исходный план.
  Повторяет демон Claude Code; хост пришлось бы копировать в `%LOCALAPPDATA%` (иначе установщик упирается в занятый exe,
  а `CheckIfAppIsRunning` убивает процессы с именем `echo-studio.exe`), версионировать протокол и решать, что делать со
  старым хостом после обновления. Отвергнуто: много кода ради уже существующего.
- PTY в процессе окна без хоста — закрытие окна убивает сессии, противоречит FR-010.

Риски закрыты спайком (раздел «Спайк attach» ниже); открытым остаётся только «переживает ли `agents --json --all`
перезагрузку» — проверяется в US1 (quickstart §2), запасной вариант — список открытых сессий в состоянии Echo.

## R-02. Терминал в окне

**Decision**: `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl` (запасной — DOM-рендер при потере контекста
WebGL). PTY — `portable-pty` (ConPTY) в процессе Echo Studio, команда — `claude.exe attach <id8>` напрямую, без Git Bash
(шелл после выхода Claude не нужен: завершённая сессия показывает «Продолжить»). Вывод PTY → фронт через
`tauri::ipc::Channel<Vec<u8>>` пачками (не чаще 1 раза в 16 мс), ввод и ресайз — IPC-командами.

**Клавиши** (`attachCustomKeyEventHandler`, раскладка не важна — сравниваем `event.code`):
Shift+Enter и Alt+Enter → `\x1b\r`; Alt+`KeyV` → `\x1bv`; Ctrl+C при выделении → копировать, без — `\x03`;
Ctrl+V — штатная вставка текста xterm (событие `paste`, bracketed paste Claude включает сам); Ctrl+Tab /
Ctrl+Shift+Tab не отдаются терминалу (переход FR-023).

**attach — полноэкранный TUI** (спайк): alt screen `?1049h`, мышь SGR `?1000/1002/1003/1006`, фокус `?1004`, `?2004`,
`?2026`, `?9001` (win32-input-mode — xterm.js не умеет, VT-ввод работает). Поэтому `scrollback` для attach не нужен
(история = 0), листает колесо внутри Claude; выделение — Shift+мышь (`xterm` штатно). Повторный attach перерисовывает
экран целиком. Ресайз PTY перерисовывается корректно. Название вкладки — ещё и `onTitleChange` (хук ставит заголовок
через `terminalSequence`).

**Уход из сессии**: Ctrl+Z отсоединяет attach (процесс выходит, сессия жива); двойная «←» на пустом поле открывает agent
view (список фоновых сессий) в той же ячейке, флага отключения нет. Echo: выход attach при живой сессии → сразу
re-attach; agent view — по заголовку окна/экрану → кнопка «Вернуться к сессии» (re-attach). Ctrl+Z перехватывать не
нужно.

**Папка не доверена**: `--bg` выходит с «Workspace not trusted…» → диалог «Папка не доверена» с кнопкой «Открыть в
Claude» (существующий `open_in_claude_code`, WT): в диалоге доверия по умолчанию «No, exit», пользователь выбирает сам.
Echo доверие не ставит (принцип I: `~/.claude.json`).

**Окружение дочерних процессов**: убрать переменные `CLAUDE*` / `CLAUDECODE` (память
`claude-launch-git-bash-alt-v`: с ними транскрипт не пишется) — актуально, когда Echo запущен из сессии Claude (dev).
Аргументы — через `std::process::Command` (UTF-16): русский текст через bash в аргументе дошёл до `claude.exe` битым.

**Alternatives**: `tauri-plugin-pty` (тонкая обёртка той же `portable-pty`, лишний слой); `@xterm/headless` (не нужен —
состояние экрана держит сам Claude).

## R-03. Статусы сессий

**Decision**: два источника, по спайку (замеры раз в 0,5 с, хук и agents расходятся на ~1 с).

- **`claude agents --json`** — список, `kind` (фоновая = открывается в оболочке, интерактивная = «вне оболочки»), `id`
  для attach, `name`, `pid` и **`status`** — `busy` (работает), `waiting` (вопрос/разрешение, появляется за ~3 с),
  `idle`. Поле `state` не использовать: у свежей сессии без промпта `state=blocked` при `status=idle`. Вызов —
  480–700 мс (холодный процесс), поэтому не таймером, а по изменению файлов хука (дебаунс 500 мс, не чаще 1 раза в
  секунду), после каждого действия и раз в 15 с, пока раздел виден.
- **Файлы хука** `~/.claude/state/sessions/<sessionId>.json` (`session-status.js`, слежение `notify`, `*.tmp`
  игнорировать): `state` `done`/`error` (их нет в `status`), `phase` (`thinking`/`tool`/`agents`), `tool`, `since`.
  `claudePid` = `pid` из agents.
- «Готово» → «простаивает», когда пользователь посмотрел ячейку: отметка `seen` в сторе Echo, файлы хука Echo не пишет.
  `MarkSeen` мода Taskbar Claude Sessions для фоновых сессий не сработает (окна WT нет) — задача мода, не этой фичи.
- Живость — сессия есть в `agents --json`, иначе «завершена».

Название вкладки (FR-016) — `name` из `agents --json`, затем `custom-title`/`ai-title` транскрипта (уже читает
`conversations::scanner::parse_session_meta`), до них — «Claude».

## R-04. Dev-серверы: отдельный процесс, лог в файл, именованный Job Object

**Decision** (выбор пользователя): команда (R-06) запускается `cmd.exe /d /s /c <команда>` в папке проекта с
`CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB` (без breakaway, если родитель в job без права
breakaway), stdin — null, stdout+stderr → `%LOCALAPPDATA%\com.stillmvd.echo-studio\workbench\dev\<slug>.log`
(перезаписывается при старте), `FORCE_COLOR=1`. Сразу после запуска процесс кладётся в именованный Job Object
`Local\EchoStudio.dev.<slug>`; состояние — `<slug>.json` рядом (`projectPath`, `command`, `pid`, `startedAt`).

- Окно закрыто или обновляется → сервер работает (процессы не потомки job окна, job живёт, пока в нём есть процессы).
- При старте Echo — `OpenJobObjectW` по имени из каждого файла состояния: открылся и в нём есть процессы → «работает»,
  иначе «остановлен» с последним логом.
- «Стоп» — `TerminateJobObject`: гасит всё дерево, включая сирот (`pnpm -r --parallel` → vite + 2× `node --watch` в AM 2.0),
  чего `taskkill /T` не умеет, когда промежуточный родитель уже вышел. Затем добор: процессы из списка R-07 с cwd или
  командной строкой внутри папки проекта и временем старта ≥ `startedAt` (на случай, если кто-то вышел из job через
  breakaway) — тот же код, что классификация US7.
- Падение, пока Echo открыт, — ожидание корневого процесса; ненулевой код без «Стоп» → «ошибка», лог сохранён (FR US3-3).
- Порты (FR-041) — список pid job (`QueryInformationJobObject` `JobObjectBasicProcessIdList`) × `GetExtendedTcpTable`
  (IPv4 и IPv6, `LISTEN`), раз в 2 с, пока «запускается», потом раз в 10 с. «Открыть» — первый порт через
  `@tauri-apps/plugin-shell` `open` (FR-072).
- Лог в окне — xterm только для чтения; Rust читает прирост файла (`notify` + позиция) и шлёт в `Channel`; при
  подключении — хвост ≤ 2 МБ.

**Alternatives**: PTY в процессе окна (сервер умирает с окном — отвергнуто пользователем); свой хост только ради dev
(интерактивные клавиши vite `h`/`r` не стоят хоста); `taskkill /T /F` (теряет сирот).

## R-05. Дерево проектов и иконки

**Decision**: Rust-порт `_maintenance/sync-workspace.py` (сверено с `extract.cjs` стенда 301):
верхний уровень — папки без `.`/`_` в начале и не из `SKIP_TOP` (`_archived`, `_maintenance`, `_build`); папка верхнего
уровня с маркером (`.git`, `package.json`, `manifest.json`, `index.html`, `CLAUDE.md`, `.gitignore`, `.vscode`) — проект
без группы, иначе группа, а каждая её подпапка (кроме `.`/`_`, `node_modules`, `EXCLUDE` = `Breeze-main`,
`Smart Control-main`) — проект. Внутрь проекта не заходим.

Иконка: `desktop.ini` (BOM `FF FE` → UTF-16LE, иначе UTF-8) → `IconResource=…\<имя>.ico` →
`_maintenance/folder-icons/<имя>-small.svg`, текст SVG отдаётся в IPC (не путь — webview не ходит в файлы вне ресурсов).
SVG — свои файлы пользователя, но в DOM вставляется как `<img src="data:image/svg+xml,…">`, не `innerHTML`.
Нет файла → нейтральный значок. Слежение за корнем — `notify` без рекурсии вглубь проектов (только 2 уровня).

## R-06. Команда dev

**Decision**: по `package.json` проекта (как `extract.cjs`): есть `src-tauri` и скрипт `tauri` → `<pm> tauri dev`;
иначе `dev`; иначе `start`; нет — кнопки нет. Менеджер: `pnpm-lock.yaml` → `pnpm`, `yarn.lock` → `yarn`, `bun.lock(b)` →
`bun run`, иначе `npm run`. Команда собирается в Rust из `package.json`; фронт передаёт только путь проекта.

## R-07. Процессы по проектам и висящие

**Decision**: crate `sysinfo` (pid, ppid, имя, командная строка, cwd, память) — снимок по запросу и раз в 5 с, пока
открыт Обзор. Показываются только: `claude.exe`, `node.exe`, `bun.exe`, `rust-analyzer.exe`, `cargo.exe`, процессы
dev-job и `chrome.exe` с `--user-data-dir` внутри `~/.cache/chrome-profiles` (браузер пользователя — нет, FR-063).

Привязка — первое сработавшее правило (v2, проверено на живом снимке + синтетике, `fixtures/`):

1. `chrome.exe` без `chrome-profiles` в командной строке → `ignore: user-browser` (не показывать, не трогать, FR-063);
   `claude.exe daemon …` → `ignore: claude-daemon` (общий для всех фоновых сессий).
2. Живой `claude` (pid из файлов хука и `agents --json`) → проект сессии, `guard: live-session`; `claude --bg-pty-host`
   с живым claude-потомком → его сессия.
3. Потомок живого `claude` → проект сессии, `guard: live-session`.
4. Член dev-job Echo → проект job, `guard: running-dev` (важнее cwd: dev может сменить папку).
4а. `claude.exe`, не подтверждённый хуком/`agents` (нет файла хука, `--bg` без файла), и его потомки → проект по
   cwd этого claude, `guard: live-session`: мёртвым его не считаем, пока не доказано.
5. «Инструмент сессии» (chrome-devtools-mcp, rea, другой `… mcp`, rust-analyzer, Chrome-профиль) без живого claude
   в предках: есть `Code.exe` в предках → проект по cwd (редактор, не висящий); иначе `orphan session-closed`, проект —
   по профилю из `.mcp.json` (для Chrome) или cwd себя/предка; `since` — последний `updatedAt` файла хука с тем же
   `projectDir` и мёртвым `claudePid` (нет файла — без `since`).
6. cwd внутри папки проекта → проект. Промежуточные `cmd`/`conhost`/`bash`/`sh` и `esbuild`/`dart` с cwd вне проектов
   (`C:\WINDOWS`) — наследуют отнесение ближайшего предка из списка.
7. Одинаковые командная строка + cwd в одном проекте → старшие `orphan duplicate` (`of` — pid младшего), кроме
   процессов живой сессии и dev-job; потомки дубля — тоже дубль.
8. Иначе `orphan no-project`.

Сам Echo, его потомки (WebView2) и предки до первого `claude.exe` в снимок не попадают — их не показать и не
завершить. `kill_processes` принимает `{ pid, startTime }`: время старта сверяется со свежим снимком (pid могли
переиспользовать, пока открыт диалог). «Завершить все» у «Без проекта» — через `ConfirmDialog` со списком.

Сессия вне проектов (cwd = корень `Projects`) — `session` без `projectPath`, это не висящий. Промежуточные
`cmd`/`conhost`/`bash`/`sh` не показываются, но классифицируются — нужны для дерева при завершении. На снимке
20.10.2026: 47 видимых живых процессов, все отнесены верно, висящих нет (4 копии MCP — 4 живые сессии; два
`node --watch` — api и worker AM 2.0); висящие в фикстуре — только синтетика S1–S7 (поле `synthetic`).

Завершение — повторная классификация на стороне Rust перед `kill` (pid должен быть в текущем списке), дерево — для
Chrome-профиля (корневой процесс) и dev-job. Живая сессия Claude и работающий dev — только с подтверждением
(`ConfirmDialog`).

**Alternatives**: WMI (`Win32_Process`) — медленно (сотни мс), cwd не отдаёт; ручное чтение PEB через `windows-sys` —
то же, что делает `sysinfo`, но своим кодом.

## R-08. Лимиты 5 часов и недели

**Decision** (одобрено пользователем): мост в `~/.claude/statusline.sh` рядом с уже существующим
`ctx-<session>.json`: из `.rate_limits.five_hour` / `.seven_day` (`used_percentage`, `resets_at`) писать
`%TEMP%/claude-memory/rate-limits.json` `{ "five_hour": {…}, "seven_day": {…}, "updatedAt": <epoch> }` через temp → `mv`.
Echo читает файл и следит за ним; `resets_at` в прошлом → плитка «сброшен», файла нет → «нет данных» (FR-060). В сеть
Echo не ходит (принцип V).

## R-09. Токены и git

- **Токены** (FR-060/061) — Rust-порт `usage.cjs`: `.jsonl` с mtime за 7 дней, сумма `input + output +
  cache_creation` по `message.usage`, дедупликация по `message.id`, проект — по `cwd`. Кэш в памяти по `(путь, mtime,
  размер)`; чтение через `conversations::reader::jsonl_lines` в `spawn_blocking`. Обновление — при открытии Обзора и раз в
  60 с.
- **Git** (FR-005/061) — `git -C <p> status --porcelain=v1 -b` (`CREATE_NO_WINDOW`), разбор как в `extract.cjs`:
  ветка, `dirty`, `ahead` (незапушенное), `behind`. До 4 параллельно; при открытии раздела, при фокусе окна, раз в 60 с.
  Только чтение.

## R-10. Разговоры проекта без сессий

`conversations::scanner::list_sessions` уже отдаёт сессии проекта (id проекта — slug по `cwd`). Добавляется поле
`first_reply` — первая строка первого текстового ответа ассистента (FR-050). Клик: разговор уже открыт в живой фоновой
сессии (`sessionId` в `agents --json`) → переход к ней (FR-051), иначе `claude --bg --resume <id>`.

## R-11. Пульт, переход, состояние интерфейса

- Состояние (раскладка, ячейки, булавки, история переходов) — zustand-стор `workbench-store` с `persist`, как `ui-store`.
- Авто-порядок ячеек — чистая функция `arrangeCells(cells, sessions, now, focusCellId)` с юнит-тестами по правилам
  пульта из `WORKBENCH.md` (приоритет, вытеснение незакреплённой с самым низким приоритетом, не двигать ячейку под рукой
  3 с после ввода/прокрутки, счётчик «ещё ждут: N»).
- Ctrl+Tab — перехват на `window` в фазе capture; список недавних (`recency`) обновляется при фокусе вкладки.
- Значок статуса — сплошной по типу работы, набор значков из Windhawk-мода Taskbar Claude Sessions (lucide-эквиваленты).

## R-12. Конституция

Запуск и завершение процессов — новое для приложения. Пользователь одобрил MINOR 1.1.0 → 1.2.0: принцип VII «Процессы
пользователя». Вносится через `/speckit-constitution` вместе с планом.

## Спайк attach

2026-10-20, соседняя сессия: PTY через pywinpty (ConPTY — тот же путь, что `portable-pty`) + pyte для снимков экрана,
Claude 2.1.304, `CLAUDE*` убраны из окружения.

| Проверка | Итог |
|----------|------|
| `--bg --session-id <uuid>` | не работает: «--bg manages the session id; ignoring --session-id» → id из вывода |
| `--bg --resume <id> -n <name>` | создал копию с новым `sessionId`; без флагов — продолжает ту же |
| Недоверенная папка | `--bg` выходит с «Workspace not trusted» |
| Shift+Enter `\e\r` | перевод строки ✔ |
| Alt+V `\ev` с картинкой в буфере | `[Image #1]` ✔ |
| Русский ввод | ✔ |
| Ctrl+C | очищает поле / прерывает, attach жив ✔ |
| Ctrl+Z | отсоединяет attach, сессия жива |
| Двойная «←» на пустом поле | agent view в той же ячейке |
| Закрытие PTY | сессия жива ✔ |
| Повторный attach | экран перерисован целиком, колесо листает историю ✔ |
| Ресайз 120×40 → 90×28 | перерисовка без мусора ✔ |
| Статусы | busy/waiting/idle из agents, phase/tool из хука (R-03) |
| statusline в bg-сессии | выполняется → мост лимитов получает данные и от них |

Пробные сессии `spike-echo-a`/`-b` — stop + rm; остался транскрипт в `~/.claude/projects/C--Users-stillmvd-AppData-Local-Temp-…-spike-work/`, папка `spike\work` доверена в `~/.claude.json`.

Вне фичи (мод Taskbar Claude Sessions): клик по фоновой сессии — нужна ссылка в Echo; `MarkSeen` для фоновых сессий;
`IsOrphanedTerminal` может скрыть bg-сессию, запущенную `claude --bg` из WT (из Echo — видна).
