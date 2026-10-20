# Data Model: Рабочее место (005)

Хранилищ нет: всё читается из файлов пользователя и Claude Code. Своё состояние Echo — файлы dev-серверов
(`%LOCALAPPDATA%\com.stillmvd.echo-studio\workbench\dev\`) и стор интерфейса (zustand `persist`).

## ProjectTree

| Поле | Тип | Источник |
|------|-----|----------|
| `groups` | `ProjectGroup[]` | папки верхнего уровня без маркера (R-05) |
| `roots` | `Project[]` | папки верхнего уровня с маркером |

**ProjectGroup**: `name`, `icon: string \| null` (SVG), `projects: Project[]`.

**Project**

| Поле | Тип | Правило |
|------|-----|---------|
| `path` | string | абсолютный, ключ |
| `name` | string | имя папки |
| `group` | string \| null | |
| `icon` | string \| null | SVG из `folder-icons/<имя>-small.svg` по `desktop.ini` |
| `dev` | `DevCommand \| null` | R-06 |
| `mcp` | `{ profile: string \| null, headless: boolean } \| null` | `.mcp.json` → `chrome-devtools.args` |
| `hasClaudeMd` | boolean | |
| `exists` | boolean | `false` — папку удалили при живой сессии (edge case) |

**DevCommand**: `command` (строка для показа), `kind: "tauri" \| "web"`. Сам запуск собирается в Rust заново из
`package.json`.

**GitState** (отдельный запрос, по проекту): `branch`, `dirty`, `ahead`, `behind`, `upstream: boolean`; проект без
`.git` → `null`; ошибка git → `{ error }` (принцип III).

## ClaudeSession

Слияние `claude agents --json` и файла хука по `sessionId`.

| Поле | Тип | Источник |
|------|-----|----------|
| `sessionId` | uuid | оба |
| `shortId` | string \| null | `agents.id` (есть у фоновых) |
| `kind` | `"shell" \| "external"` | `background` → `shell` (открывается в оболочке), `interactive` → `external` |
| `projectPath` | string \| null | `agents.cwd` / `hook.projectDir`, сопоставление с `Project.path` (префикс, регистр не важен) |
| `name` | string | `agents.name` → `custom-title`/`ai-title` → «Claude» |
| `status` | `Status` | см. ниже |
| `phase` | `"thinking" \| "tool" \| "agents" \| null` | hook |
| `tool` | string \| null | hook |
| `since` | epoch ms | hook (`since`) — для «дольше ждёт» |
| `pid` | number \| null | `agents.pid` / `hook.claudePid` |
| `transcript` | string \| null | hook |

**Status** = `waiting | error | working | done | idle | exited`.
Приоритет срочности (полоса, «Запущено», пульт): `waiting → error → working → done → idle → exited`.

Вычисление: `agents.status` `waiting` → `waiting`, `busy` → `working`; `idle` → по хуку: `error` → `error`, `done` и
сессия не просмотрена в Echo → `done`, иначе `idle`. Поле `agents.state` не используется (`blocked` у свежей сессии).
Сессии нет в `agents --json` → `exited` («Продолжить» = `claude --bg --resume <id>` без флагов).

## DevServer

Файл `<slug>.json` + живое состояние job.

| Поле | Тип | Правило |
|------|-----|---------|
| `projectPath` | string | ключ; `slug` — hash пути |
| `command` | string | |
| `state` | `"starting" \| "running" \| "stopped" \| "error"` | `starting` до первого порта или 30 с |
| `ports` | number[] | LISTEN-порты процессов job |
| `startedAt` | epoch ms | |
| `exitCode` | number \| null | только пока Echo видел выход корневого процесса |
| `log` | string | путь к `<slug>.log` |

Переходы: `stopped → starting → running`; `starting|running → stopped` (Стоп); `starting|running → error` (корневой
процесс вышел сам с кодом ≠ 0 или job пуст без Стопа); `error|stopped → starting` («запустить снова»).

## TerminalTab (фронт)

`{ id, kind: "claude" | "dev", sessionId? , projectPath }`. Вкладка Claude держит подписку на PTY attach
(`terminalId` из Rust); вкладка dev — подписку на хвост лога. Закрытие вкладки Claude = только отсоединение.

## Cell / Wall (фронт, `workbench-store`, persist)

| Поле | Тип |
|------|-----|
| `layout` | `"1x1" \| "2x1" \| "2x2"` |
| `cells` | `{ id, projectPath, tabs: TerminalTab[], activeTabId, pinned: boolean, manual: boolean, lastInputAt }[]` |
| `recency` | `string[]` — id вкладок, недавние первыми (Ctrl+Tab) |

Правило `arrangeCells` (R-11): ячейки занимают сессии по `Status`-приоритету, внутри — по `since` (дольше ждёт выше);
вытесняется незакреплённая, не ручная, без ввода/прокрутки в последние 3 с, с самым низким приоритетом; вытесненные →
`offGrid` полосы; `pendingCount` = ждущие вне сетки.

## Conversation (расширение `SessionMeta`)

Добавляется `first_reply: Option<String>` — первая строка первого текстового ответа ассистента, до 120 символов.

## RateLimits

`{ fiveHour: Limit | null, sevenDay: Limit | null, updatedAt }`, `Limit = { usedPercentage, resetsAt }` из
`%TEMP%/claude-memory/rate-limits.json`. `resetsAt` в прошлом → «сброшен»; файла нет → `null` («нет данных»).

## Usage

По проекту: `week`, `today`, `sessions` (число транскриптов), `days: Record<YYYY-MM-DD, number>`.

## ProcessRow

| Поле | Тип |
|------|-----|
| `pid`, `name`, `memory` (байты), `commandLine` (сокращённая) | |
| `projectPath` | string \| null |
| `orphan` | `{ reason: "session-closed" \| "duplicate" \| "no-project", since?: number } \| null` |
| `guard` | `"live-session" \| "running-dev" \| null` — завершение только с подтверждением |
