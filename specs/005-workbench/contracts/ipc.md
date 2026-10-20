# IPC-контракт: Рабочее место

Команды Tauri (`invoke`), типы — из [data-model.md](../data-model.md). Ошибки — строка. Файловый I/O и запуск внешних
команд (`claude`, `git`) — в `spawn_blocking`.

**Guard'ы** (принцип II, VII):

- `projectPath` — существующая папка, которая есть в текущем дереве проектов (R-05); иначе ошибка.
- `shortId` — `[0-9a-f]{8}`, `sessionId` — UUID; ни одна строка от фронта не попадает в командную строку как текст
  команды.
- Команда dev собирается в Rust из `package.json` проекта, фронт её не передаёт.
- `pid` для завершения — только из свежей классификации процессов (R-07) на стороне Rust.

## Дерево и проекты

### `list_workbench_projects() -> ProjectTree`
Дерево `C:\Users\stillmvd\Projects` с иконками, dev-командой, MCP-профилем. Событие `workbench://projects` — при
появлении/удалении папок (дебаунс 500 мс).

### `read_git_states(paths: string[]) -> Record<string, GitState | null>`
`git status --porcelain=v1 -b`, до 4 параллельно.

## Сессии Claude

### `list_claude_sessions() -> ClaudeSession[]`
Слияние `claude agents --json` и файлов хука (R-03). Событие `workbench://sessions` — изменение файлов хука (дебаунс
300 мс) и результат периодического `agents --json`.

### `start_claude_session(projectPath: string, resumeSessionId?: string) -> { sessionId, shortId }`
Новая: `claude --bg` в папке проекта, `shortId` — из вывода `backgrounded · <id8> · <name>`, `sessionId` — из
`agents --json`. Продолжение: строго `claude --bg --resume <id>` без других флагов; если разговор уже идёт в живой
фоновой сессии — возвращает её без запуска (FR-051). Окружение без `CLAUDE*`. Ошибка `untrusted` — вывод содержит
«Workspace not trusted» (фронт предлагает «Открыть в Claude»).

### `stop_claude_session(shortId: string) -> void`
`claude stop <id>`. Фронт вызывает только после подтверждения.

### `forget_claude_session(shortId: string) -> void`
`claude rm <id>` для завершённой сессии при закрытии её вкладки (транскрипт остаётся).

## Терминал

### `terminal_attach(shortId: string, cols: number, rows: number, onData: Channel<number[]>) -> { terminalId }`
PTY в процессе Echo: `claude attach <shortId>`. Вывод — в `onData` пачками ≤ 16 мс. Выход attach → событие
`workbench://terminal-exit { terminalId, code }`; фронт делает re-attach, если сессия ещё в `agents --json` (Ctrl+Z),
иначе помечает вкладку «завершена».

### `terminal_write(terminalId: string, data: string) -> void`
### `terminal_resize(terminalId: string, cols: number, rows: number) -> void`
### `terminal_detach(terminalId: string) -> void`
Убивает только клиент attach, сессия живёт у демона Claude Code.

## Dev-сервер

### `list_dev_servers() -> DevServer[]`
Файлы состояния + живые job (R-04). Событие `workbench://dev` — смена состояния или портов.

### `start_dev_server(projectPath: string) -> DevServer`
Запуск в именованном job, лог перезаписывается. Уже работает → ошибка.

### `stop_dev_server(projectPath: string) -> void`
`TerminateJobObject`. Фронт подтверждает (FR-063).

### `tail_dev_log(projectPath: string, onData: Channel<number[]>) -> { subscriptionId }`
Хвост ≤ 2 МБ, затем прирост. `untail_dev_log(subscriptionId)` — отписка.

### `open_dev_server(projectPath: string) -> void`
`http://localhost:<первый порт>` через shell `open`.

## Разговоры

### `list_conversation_sessions(projectId)` — существующая, `SessionMeta` + `first_reply`.

## Обзор

### `read_rate_limits() -> RateLimits`
`%TEMP%/claude-memory/rate-limits.json`; событие `workbench://limits` при изменении файла.

### `read_usage() -> Record<projectPath, Usage>`
7 дней по транскриптам, кэш по `(путь, mtime, размер)`.

### `list_processes() -> ProcessRow[]`
Снимок `sysinfo` + классификация (R-07).

### `kill_processes(pids: number[], confirmed: boolean) -> { killed: number[], failed: { pid, error }[] }`
Перед завершением — новая классификация. Pid вне списка — отказ; pid с `guard` при `confirmed = false` — отказ.
Chrome-профиль и член dev-job завершаются деревом.

## Внешний контракт: мост лимитов в `~/.claude/statusline.sh`

```json
{ "five_hour": { "used_percentage": 73, "resets_at": 1792540800 },
  "seven_day": { "used_percentage": 20, "resets_at": 1792558800 },
  "updatedAt": 1792511000 }
```

Путь `%TEMP%/claude-memory/rate-limits.json`, запись temp → `mv -f`, только когда во входе statusLine есть
`.rate_limits`. Правка statusline — одобрена пользователем 2026-10-20.
