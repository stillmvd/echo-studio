# Kimi Code CLI 2.4.1: справка для адаптации Echo Studio и плагина памяти

Источник: `docs` = `C:\Users\stillmvd\.claude\jobs\fafbee47\tmp\kimi-docs.txt` (номера строк английских разделов). `real` = установленный `C:\Users\stillmvd\.kimi-code\` (только структура ключей). Ключи api_key/oauth не выписаны.

## 0. Главное

| Тема | Совместимо с Claude Code как есть | Надо адаптировать |
|---|---|---|
| Хуки | идея stdin JSON + exit 2 = блок, `hookSpecificOutput.permissionDecision` | конфиг TOML в `config.toml`; нет проектных хуков; имена полей tool_input другие |
| Инструменты | имена `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Agent`, `Skill`, `AskUserQuestion` совпадают | поле пути `path`, а не `file_path` |
| Агенты | frontmatter `name/description/tools` читается, `model` игнорируется | каталоги `.kimi-code/agents` и `.agents/agents`, не `.claude/agents` |
| MCP | формат `mcpServers` тот же (command/args/env/url/headers) | файл `~/.kimi-code/mcp.json` и `.kimi-code/mcp.json`; project-MCP только в доверенной папке |
| Skills | `SKILL.md` + `name/description` | `~/.claude/skills` НЕ читается; читает `~/.kimi-code/skills`, `~/.agents/skills` |
| Инструкции | | `AGENTS.md`, не `CLAUDE.md`; `CLAUDE.md` в доках не упомянут |
| Сессии | | свой формат `wire.jsonl` (не Claude transcript); `transcript_path` в хуках не описан |

## 1. Встроенные инструменты и поля tool_input

Имена (docs:1416-1561). Matcher хука для tool-событий это регулярка по имени инструмента (docs:5257, 5260).

| Группа | Инструменты | docs |
|---|---|---|
| Файлы | `Read`, `Write`, `Edit`, `Grep`, `Glob`, `ReadMediaFile` | 1420-1427 |
| Shell | `Bash` | 1451 |
| Web | `WebSearch`, `FetchURL` | 1468-1469 |
| План | `ExitPlanMode` | 1481 |
| Состояние | `TodoList` | 1491 |
| Коллаборация | `Agent`, `AgentSwarm`, `AskUserQuestion`, `NotifyUser` (выкл. по умолчанию), `Skill` | 1501-1505 |
| Фон | `TaskList`, `TaskOutput`, `TaskStop`, `WaitFor` | 1531-1534 |
| Cron | `CronCreate`, `CronList`, `CronDelete` | 1552-1554 |
| MCP | `mcp__<server>__<tool>` | docs:6416 |

Поля аргументов (docs / real):

| Инструмент | Поля | Источник |
|---|---|---|
| `Bash` | `command` (обяз.), `cwd`, `timeout` (мс), `run_in_background`, `description`, `disable_timeout` | docs:1455-1460; real: `command`, `timeout` |
| `Read` | `path`, `line_offset`, `column_offset`, `n_lines`, `max_chars` | docs:1429; real: `path,line_offset,n_lines` |
| `Write` | `path`, `content`, `mode` (`overwrite`/`append`) | docs:1435; real: `path,content` |
| `Edit` | `path`, `old_string`, `new_string`, `replace_all` | docs:1437; real: `path,old_string,new_string` |
| `Grep` | `pattern`, `path`, `type`, `glob`, `output_mode`, `-A/-B/-C/-i/-n`, `multiline`, `head_limit`, `offset`, `include_ignored` | docs:1439 |
| `Glob` | `pattern`, `path`, `include_ignored`, `offset`, `head_limit` | docs:1441-1443 |
| `Agent` | `prompt`, `description`, `subagent_type` (по умолчанию `coder`), `resume`, `run_in_background`, `model` | docs:1507; real: `subagent_type,description,prompt` |
| `Skill` | `skill`, `args` | docs:1523; real: `skill` |
| `AskUserQuestion` | `questions` (1-4) | docs:1511 |

Критично для хуков: путь файла в `Write/Edit/Read` лежит в `tool_input.path`, у Claude это `file_path`. Пример в доках читает `payload.tool_input?.command` (docs:5295).

Payload событий. В доках описан только базовый набор и несколько полей отдельных событий:

| Событие | Поля | docs |
|---|---|---|
| Все | `hook_event_name`, `session_id`, `session_title`, `client_type`, `cwd` | 5211-5219 |
| `PreToolUse`/`PostToolUse` | матчатся по имени инструмента; `tool_input.command` показан в примере; остальные поля, `tool_name` и `tool_response` | не описано |
| `SessionStart` | `source` (`startup`/`resume`), `model`, `profile` | 5264 |
| `SessionEnd` | matcher `exit`/`archive` | 5265 |
| `SessionHeartbeat` | `uptime_ms`, раз в 60 с (таймер только при наличии такого хука) | 5266 |
| `UserPromptSubmit` | matcher по тексту промпта; имя поля с текстом | не описано (у `UserPromptQueued`: `prompt_id`, `prompt`, `queue_length`, docs:5256; у `TurnStarted`: `turn_id`, `origin_kind`, `origin_name`, `prompt`, docs:5259) |
| `Stop` | matcher пустая строка | 5258 |
| `SubagentStart`/`SubagentStop` | matcher по имени субагента; поля payload | не описано |
| `TaskStarted` | `task_id`, `description`, `detached` | 5269 |
| `Interrupt` | `reason` | 5271 |
| `transcript_path` или аналог | не описано. Путь к `wire.jsonl` собирать самому: `sessions/<workspaceId>/<session_id>/agents/main/wire.jsonl` | docs:10692-10699 |

Практика: чтобы узнать реальные поля, поставить хук-логгер, который пишет stdin в файл. В доках их нет.

Полный список событий (docs:5253-5274): `UserPromptSubmit`, `UserPromptQueued`, `PreToolUse`, `Stop`, `TurnStarted`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionResult`, `SessionStart`, `SessionEnd`, `SessionHeartbeat`, `SubagentStart`, `SubagentStop`, `TaskStarted`, `StopFailure`, `Interrupt`, `PreCompact`, `PostCompact`, `Notification`.

## 2. Как хук добавляет контекст

- Конфиг: `[[hooks]]` в `config.toml` с полями `event`, `matcher`, `command`, `timeout` (1-600 с, по умолчанию 30); лишние поля ломают загрузку конфига (docs:5190-5197).
- Exit 0: stdout «может быть добавлен в контекст» (docs:5229).
- Exit 2: блок, stderr идёт причиной (docs:5230).
- Прочие коды, таймаут, падение: fail-open, операция разрешена (docs:5231-5232).
- Блок JSON-ом: `{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":"..."}}` (docs:5238-5244).
- Блокирующие события: только `PreToolUse`, `Stop`, `UserPromptSubmit` (docs:5248). Остальные «выстрелил и забыл»: вывод `SessionStart` и `PostToolUse` в контекст не попадает.
- `UserPromptSubmit`: «returned text is appended to context» (docs:5255). Фикс в 2.2.0: JSON-вывод хука БЕЗ поля `message` не добавляется в разговор (docs:1688). Значит, надёжно только plain text в stdout или JSON с `message`. Формат с `message` в основных доках не описан.
- `Stop` при блоке: можно добавить сообщение, чтобы модель продолжила (docs:5258).
- `additionalContext` (как у Claude): не описано.
- Для инъекции на старте сессии вместо `SessionStart`-хука есть плагинный `sessionStart.skill`: грузит скилл плагина в главный агент при новой или возобновлённой сессии, только текст (docs:6930, 7045). Плюс `systemPrompt`/`systemPromptPath` плагина (до 32 КБ на поле, до 64 КБ суммарно, docs:6932-6959).
- Хуки живут только в пользовательском `config.toml` и в плагинах; проектного файла хуков нет (docs:5201). Хук запускается в cwd проекта сессии (docs:5203, 1669). Плагинный хук: cwd = корень плагина, env `KIMI_CODE_HOME`, `KIMI_PLUGIN_ROOT` (docs:7125-7126).
- Одинаковые `command` в нескольких правилах запускаются один раз; совпавшие хуки идут параллельно (docs:5199).

## 3. Кастомные агенты

- Каталоги (приоритет: `--agent-file` > проект > extra > user > плагин > встроенные, docs:1247):
  - user: `$KIMI_CODE_HOME/agents/` (по умолчанию `~/.kimi-code/agents/`), `~/.agents/agents/` (docs:1251-1252)
  - project (корень = ближайший `.git` вверх): `.kimi-code/agents/`, `.agents/agents/` (docs:1258-1259)
  - extra: `extra_agent_dirs = [...]` в `config.toml` (docs:1261-1265)
  - сканируются рекурсивно, `*.md`.
- `.claude/agents/*.md` НЕ сканируется. Можно добавить через `extra_agent_dirs`, например `["~/.claude/agents"]` (по логике docs:1261; прямо не проверено).
- Frontmatter (docs:1301-1309): `name` (kebab-case, по умолчанию имя файла), `description` (обяз.), `whenToUse`, `override`, `tools` (список или строка через запятую; `mcp__srv__*` как glob; `[]` = без инструментов), `disallowedTools`, `subagents`.
- Тело файла это системный промпт с шаблоном `${var}` (docs:1317, список переменных docs:1363-1374).
- Поле `model`: НЕТ. Поля других агентов, в том числе `model` Claude Code, игнорируются (docs:1319). Модель субагента задаётся пулом `[secondary_model]` / параметром `model` инструмента `Agent` (docs:1507).
- Совместимость: минимальный файл `description` + тело работает везде; запятая в `tools` оставляет Claude-стиль загружаемым (docs:1319). Имена инструментов регистрозависимы (`Read`, не `read`, docs:1311).
- Встроенные субагенты: `coder` (по умолчанию), `explore` (read-only), `plan` (без shell) (docs:1200-1202).
- Выбор главного агента: `--agent <name>`, `--agent-file <path>` (только новая сессия, docs:1333-1336). `$KIMI_CODE_HOME/SYSTEM.md` заменяет системный промпт главного агента (docs:1351).
- Состояние субагентов: `sessions/.../agents/<id>/wire.jsonl`, у фоновых ещё `tasks/` (docs:1394). Real: `agents/agent-0/wire.jsonl`.

## 4. MCP

- Файлы: user `~/.kimi-code/mcp.json` (или `$KIMI_CODE_HOME/mcp.json`); project `.kimi-code/mcp.json`; одноимённый project перекрывает user (docs:6281-6284). Не `.mcp.json`.
- Схема (docs:6296-6314): `{"mcpServers": { "<name>": {...} }}`. Есть `command` + `args` = stdio; `url` без `transport` = HTTP; `transport: "sse"` для старого SSE. Тот же корневой ключ, что у Claude.
- Доп. поля (docs:6318-6330): `env`, `environment_id`, `cwd`, `headers`, `bearerTokenEnvVar`, `enabled`, `deferred`, `startupTimeoutMs` (по умолчанию 30000), `toolTimeoutMs`, `enabledTools`, `disabledTools`.
- Claude-вариант `"type": "http"` / `"type":"stdio"` в доках не описан (определение по наличию `command`/`url`; прямо про игнор лишних полей для mcp.json не сказано).
- Проектный `mcp.json` включается только после «Trust this folder»; в `kimi -p` без доверия отключён. Обход: `KIMI_CODE_TRUST_WORKSPACE=1` (docs:6290-6292).
- Имена инструментов: `mcp__<server>__<tool>`, как у Claude (docs:6416).
- Сервер, добавленный в mcp.json при открытой сессии, подхватывается только новыми сессиями (docs:6288).
- Плагин тоже может нести `mcpServers` (docs:6934, 7064-7093).
- `/import-from-cc-codex` умеет переносить MCP из Claude/Codex (docs:10963), детали не описаны.

## 5. Skills

- Формат (docs:680-711): папка `<name>/SKILL.md` (рекомендуется) или плоский `<name>.md` в корне каталога скиллов.
- Frontmatter: `name`, `description` (оба обязательны в `SKILL.md`), `type` (`prompt` по умолчанию, `inline`, `flow`; `flow` = только ручной вызов), `whenToUse` (также `when-to-use`, `when_to_use`), `disableModelInvocation` (также kebab/snake), `arguments` (список или строка).
- Плейсхолдеры тела: `$ARGUMENTS`, `$ARGUMENTS[0]`, `$0`, `$<name>`, `${KIMI_SKILL_DIR}` (docs:721-724).
- Каталоги (приоритет Project > User > Extra > Built-in, docs:730): user `$KIMI_CODE_HOME/skills/`, `~/.agents/skills/`; project `.kimi-code/skills/`, `.agents/skills/`; `extra_skill_dirs` в `config.toml`; флаг `--skills-dir` заменяет автообнаружение (docs:304).
- `~/.claude/skills` НЕ читается (в списке нет). Реальные скиллы пользователя в Kimi идут из `~/.agents/skills/` (real: `skillPath` = `C:/Users/stillmvd/.agents/skills/phase-plan/`, `skillSource: "user"`).
- Вызов: `/skill:<name> [текст]`; сокращение `/<name>`, если имя не занято системной или плагинной командой (docs:10970-10986). Плагинные скиллы только как `/skill:<plugin>:<skill>` (docs:7047, 1655).
- `/import-from-cc-codex` (docs:10963, changelog 3099, 1608): «Import Claude Code and Codex instructions, skills, and MCP settings». Что именно и куда копируется, как это выбирается: не описано (встроенный скилл, «selected» значит выбор пользователя).

## 6. Пользовательские slash-команды вне плагинов

- Каталога `~/.kimi-code/commands` в доках нет: не описано.
- Пользовательские команды появляются двумя путями:
  1. Skills: автоматически регистрируются как `/skill:<name>` и `/<name>` (docs:10970-10986).
  2. Плагины: `commands` в манифесте; `.md` с необязательным frontmatter (`name`, `description`), тело с `$ARGUMENTS`; вызов `/<plugin>:<command>` (docs:6969-7029).
- Итог для переноса команд Claude (`~/.claude/commands/*.md`): превращать в skills (`~/.agents/skills/<n>/SKILL.md`, `type: prompt`) или в плагин.

## 7. Статуслайн

- `tui.toml`, секция `[status_line]`: `items` (встроенные слоты `mode, goal, model, tasks, cwd, git, tips`) и `command` (docs:4391-4392, 4415-4417).
- `command`: первая строка stdout заменяет первую строку футера; на stdin JSON-снимок; лимит 300 мс; не чаще раза в секунду; ошибка = встроенный вид (docs:4392).
- Состав снимка: комментарий в реальном `tui.toml`: «JSON snapshot (model, cwd, git, usage, mode)»; docs:4394 перечисляет «Model, cwd, git branch, permission mode, plan mode, context usage, session id, version». Точные имена ключей: не описано.
- `/reload-tui` перечитывает только `tui.toml` (docs:10863).
- Ограничение 300 мс: тяжёлые вызовы (например, чтение статусов) не делать, кэшировать.

## 8. Неинтерактивный режим

- `kimi -p "<prompt>"` (`--prompt`), `--output-format text|stream-json` (только с `-p`) (docs:230-231, 253).
- `-p` нельзя совмещать с `--yolo`/`--auto`/`--plan`; права по политике `auto`, статические deny-правила действуют (docs:252, 331).
- Text: транскрипт с префиксом `• `; текст ассистента в stdout; thinking, прогресс инструментов, «resuming session» в stderr (docs:331). Итоговый текст из text-режима выделять разбором префиксов неудобно, надёжнее `stream-json`.
- `stream-json`: одна JSON-строка на сообщение в stdout. Сообщение Assistant (при вызове инструмента сначала Assistant с `tool_calls`, затем Tool message, затем следующий Assistant); thinking не пишется; прогресс и resume-подсказки в stderr (docs:339-345). Точная схема сообщения: не описано. Resume-подсказка выдаётся структурным meta-сообщением (changelog docs:3445), ретраи показываются событиями (docs:2451). Итоговый ответ = текст последнего Assistant-сообщения без `tool_calls`.
- Полезные флаги для вызова «спроси модель»: `-m <alias>`, `--agent`, `--agent-file`, `--add-dir`, `--skills-dir`, `-c`/`-S <id>` для продолжения (docs:227-238).
- Коды выхода: общая схема не описана. Известно: `/goal` в `-p` даёт 0 (выполнено), 3 (блок), 6 (пауза) (docs:10932); `kimi doctor` 0/1 (docs:449); `kimi login` 0/1 (docs:359). Для обычного промпта: не описано.
- Фоновые задачи в `-p`: `[task] print_background_mode` = `exit`|`drain`|`steer` (по умолчанию `steer`) (docs:4092). Для разового ответа «спроси модель» поставить `KIMI_CODE_BACKGROUND_PRINT_BACKGROUND_MODE=exit` (docs:4859).
- `-p` сохраняет сессию (в changelog есть фикс потери записей сессии при ошибке, docs:1844). Своего флага «не сохранять» в доках нет.
- Таймауты `-p`: фоновый Bash и субагенты без таймаута по умолчанию (docs:1458, 1507).
- Плюс `KIMI_DISABLE_TELEMETRY=1` в окружении скриптов (docs:4740).

## 9. Сессии и wire.jsonl

Раскладка (docs:4603-4663, 10683-10703; real подтверждён):

```text
~/.kimi-code/
  session_index.jsonl            # {sessionId, sessionDir, workDir} на строку
  workspaces.json                # real: {version:1, workspaces:{<wd_id>:{root,name,created_at,last_opened_at}}}; в доках раскладки не упомянут (projects.json упомянут в docs:4426)
  sessions/<workspaceId>/<sessionId>/
    state.json
    agents/main/wire.jsonl
    agents/main/blobs/<sha256>    # real: вынесенные base64-медиа (docs:3374)
    agents/<agent-N>/wire.jsonl   # субагенты, real: agent-0
    agents/main/plans/<id>.md
    tasks/<task_id>.json, tasks/<task_id>/output.log
    cron/, upcoming-goals.json, logs/kimi-code.log
  locks/sessions/                # кросс-процессные локи
```

- `workspaceId`: неявный `wd_<slug>_<12 hex sha256>` (real: `wd_breezee_3f11fc837cbb`), явный `wm_<uuid>` (docs:4652). Нужно сопоставление cwd -> workspaceId: брать из `session_index.jsonl` (`workDir`) или `workspaces.json` (`root`), хэш самим не считать.
- `sessionId` имеет форму `session_<uuid>` (real).
- `state.json` (docs:4656; real ключи): `createdAt`, `updatedAt` (ISO), `title`, `isCustomTitle`, `agents:{main:{homedir,type:"main",parentAgentId:null}}`, `custom:{}`, `workDir`, `lastPrompt`; в доках ещё `forkedFrom`.
- `session_index.jsonl`: по строке на сессию; поля `sessionId`, `sessionDir` (прямые слеши), `workDir` (docs:4652; real).
- Не править `sessions/` руками (docs:10706).

Типы записей `wire.jsonl` (real, версия протокола `1.4` у сессий июля-сентября; общий формат в доках не описан; новый движок может писать иначе; докер: при более новой версии протокола сессия открывается с предупреждением, docs:3458):

| `type` | Ключи | Назначение |
|---|---|---|
| `metadata` | `protocol_version` ("1.4"), `created_at` (мс) | первая строка |
| `config.update` | `profileName`, `systemPrompt`, `subagentNames`, `time` | профиль агента |
| `tools.set_active_tools` | `names[]` | активные инструменты |
| `mcp.tools_discovered` | `serverName`, `hash`, `tools[{name,description,inputSchema}]`, `enabledNames` | MCP |
| `permission.set_mode` | `mode` (`yolo`, ...) | режим прав |
| `turn.prompt` | `input[{type:"text",text}]`, `origin{kind,...}` | старт хода |
| `context.append_message` | `message{role,content[],toolCalls[],origin}` | сообщения user-стороны |
| `context.append_loop_event` | `event{type,...}` | события цикла (ниже) |
| `llm.tools_snapshot` | `hash`, `tools[{name,description,parameters}]` | схемы инструментов |
| `llm.request` | `kind`, `provider`, `model`, `modelAlias`, `thinkingEffort`, `messageCount`, `turnStep`, ... | трассировка запроса |
| `usage.record` | `model`, `usage{inputOther,output,inputCacheRead,inputCacheCreation}`, `usageScope` | токены |

`origin.kind` у сообщений и `turn.prompt` (real): `user` (реальный ввод), `skill_activation` (`skillName`, `trigger:"user-slash"`, `skillPath`, `skillSource`, `skillArgs`), `injection` (`variant:"todo_list_reminder"`), `shell_command` (`phase`), `system_trigger` (`name:"subagent"`). Реальные реплики пользователя это `origin.kind == "user"`.

`event.type` внутри `context.append_loop_event` (real):

| event.type | Ключи | Как использовать |
|---|---|---|
| `step.begin` | `uuid`, `turnId`, `step` | шаг модели |
| `content.part` | `part` = `{type:"think",think}` или `{type:"text",text}` | текст ассистента = `part.type=="text"` |
| `tool.call` | `toolCallId`, `name`, `args`, `description`, `display{kind,command,cwd,language}` | вызов инструмента |
| `tool.result` | `parentUuid`, `toolCallId`, `result{output,isError}` | результат |
| `step.end` | `usage`, `finishReason` (`tool_use`/`end_turn`), тайминги, `messageId` | `end_turn` = ход закончен |

- Ассистентские сообщения отдельным `context.append_message role=assistant` в real не встречаются: текст ассистента только через `content.part`. Нужен ли `role:"assistant"` в новых версиях: не проверено.
- Время записи: поле `time` (мс epoch).
- Отдельной записи конца хода нет; признак: последний `step.end` с `finishReason == "end_turn"`.
- Занятость/открытость сессии по файлам: `locks/sessions/` (docs:4622-4623, «cross-process occupancy locks while a client writes a session»); формат лок-файла в доках не описан, в текущем `~/.kimi-code` каталога `locks` нет (создаётся при открытой сессии). Ошибка «session in use» показывает имя держателя (docs:1643). Отключить: `KIMI_CODE_SESSION_LOCK=0` (docs:4874). Надёжный способ узнать «занята ли»: REST `busy` (раздел 10); по файлам: наличие и свежесть лока, детали проверить экспериментом при живом `kimi`.
- Принудительно снять лок: `POST /api/v1/sessions/{id}:takeover` (docs:8993).
- `/import-sessions` и `kimi import-sessions` (docs:10801-10813, 500-512): импорт сессий Claude Code и Codex за 15 или 30 дней, максимум 100 за прогон; читает `~/.claude` и `~/.codex` (учитывает `CLAUDE_CONFIG_DIR`, `CODEX_HOME`); в сессию кладётся одно сообщение с импортированным разговором, tool calls как короткие заметки; полная история и копия оригинальных файлов сохраняются рядом; в пикере метка `[Claude Code]`/`[Codex]`; оригиналы не меняются, модель не вызывается.
- Резюм: `kimi --continue`/`-c`, `kimi --session <id>`/`-S`, `kimi --session` (пикер) (docs:10711-10729).
- Экспорт: `kimi export <id> -o x.zip`; `/export-md` в Markdown (docs:10774-10793).
- Сабсессии: `/fork`, `:fork`; дети через `POST /sessions/{id}/children` (docs:9017).

## 10. `kimi web` и Server API

- `kimi web` запускается на переднем плане, REST+WS+веб-UI, по умолчанию `127.0.0.1:58627`, при занятости порт +1; печатает bearer-токен в баннере (docs:369-394, 8163). Сервер нужно держать запущенным самому; в `-p`/TUI-режиме API нет.
- Экземпляры регистрируются в `~/.kimi-code/server/instances/` (docs:381, 8163). Формат файлов реестра: не описано (в текущем `.kimi-code` каталога `server` нет). Это единственный путь обнаружить порт и токен без парсинга баннера: проверить экспериментом.
- Авторизация: `Authorization: Bearer <token>`; без токена только `GET /api/v1/healthz`; `KIMI_CODE_PASSWORD` как второй credential; `--dangerous-bypass-auth` отключает (docs:8165-8175, 4854).
- Ответ всегда обёртка `{code, msg, data, request_id}`, `code 0` = успех; HTTP почти всегда 200 (docs:8177-8194).
- Список сессий: `GET /api/v1/sessions?busy=true|false&page_size=..&workspace_id=..&include_archive&exclude_empty` (docs:8830-8845). Элемент сессии (docs:8793-8811): `id`, `workspace_id`, `title`, `created_at`, `updated_at`, `archived`, `busy` (есть активный ход или фоновая задача у любого агента), `main_turn_active`, `pending_interaction` (`none`/`approval`/`question`), `last_turn_reason` (`completed`/`cancelled`/`failed`), `last_prompt`, `metadata.cwd`.
- Оговорка (docs:8791): сессия, не загруженная в процессе сервера (холодная), всегда `busy=false`. Сессии из отдельных TUI-процессов `kimi` сервер видит только через индекс с задержкой около минуты (docs:10644). Значит, для статуса сессий, открытых в обычном TUI вне `kimi web`, API не годится, там только локи и `wire.jsonl`.
- Статус одной: `GET /api/v1/sessions/{id}/status` -> `{busy, model, thinking_level, permission, plan_mode, swarm_mode, context_tokens, max_context_tokens, context_usage}` (docs:9031-9039); читает с воскрешением холодной сессии.
- Прочее: `GET /api/v2/sessions` (page_token), `GET /api/v1/sessions/{id}/messages`, `.../transcript`, `.../approvals?status=pending`, `POST .../prompts` (docs:9128-9133, 9234-9252, 10385).
- WebSocket `ws://host:port/api/v1/ws` (subprotocol `kimi-code.bearer.<token>`): глобальные события `event.session.created`, `event.session.status_changed`, `event.session.work_changed`, `event.session.archived`; на сессию `turn.started`, `turn.ended`, `assistant.delta`, `tool.call.started`, `tool.result`, `event.approval.requested` и др. (docs:10596-10646). Схемы: `GET /openapi.json`, `/asyncapi.json` (docs:8153).
- API помечен экспериментальным, формат может меняться (docs:8156).
- Нет аналога `claude agents --json` как CLI-команды: в списке подкоманд (docs:349) только `login, acp, web, doctor, export, migrate, import-sessions, upgrade, provider` (+ `vis`, `app`, `install-desktop` по тексту).

## 11. Переменные окружения и AGENTS.md

Ключевые (docs:4712-4905):

| Переменная | Смысл |
|---|---|
| `KIMI_CODE_HOME` | корень данных вместо `~/.kimi-code` (config, sessions, credentials, `skills/`, `agents/`, `AGENTS.md`, `mcp.json`, `SYSTEM.md`); `~/.agents/*` остаётся в реальном home |
| `KIMI_DISABLE_TELEMETRY=1` | без телеметрии |
| `KIMI_CODE_SESSION_LOCK=0` | выключить лок сессий |
| `KIMI_CODE_TRUST_WORKSPACE=1` | считать папку доверенной на процесс (нужно для `.kimi-code/mcp.json` в `-p`) |
| `KIMI_CODE_WATCH=0` | выключить файловые вотчеры конфигов |
| `KIMI_CODE_BACKGROUND_PRINT_BACKGROUND_MODE` | `exit`/`drain`/`steer` в `-p` |
| `KIMI_SUBAGENT_TIMEOUT_MS`, `KIMI_CODE_SWARM_TIMEOUT_MS` | таймауты |
| `KIMI_MODEL_NAME` + `KIMI_MODEL_API_KEY` (+ `_PROVIDER_TYPE`, `_BASE_URL`, `_MAX_CONTEXT_SIZE`) | временная модель без правки конфига |
| `KIMI_DISABLE_CRON=1` | выключить cron-инструменты |
| `KIMI_CODE_EXPERIMENTAL_NOTIFY_USER=1` | включить `NotifyUser` (docs:1519) |
| `KIMI_LOG_LEVEL` | уровень логов |
| `KIMI_CODE_LEGACY_FLAG=1` | вернуть старый движок (docs:2097) |
| `CLAUDE_CONFIG_DIR`, `CODEX_HOME` | откуда `import-sessions` читает чужие сессии (docs:510) |
| `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY` | прокси (на машине пользователя есть V2RayN TUN) |
| `KIMI_SHELL_PATH` | путь Git Bash на Windows (docs:4896); Bash-инструмент на Windows идёт через Git Bash (docs:1462) |

API-ключи из shell НЕ читаются, только из `config.toml` (`api_key_env` у провайдера как исключение, docs:4716-4719).

Инструкции (docs:1388-1390, 4644):
- Глобальные Kimi: `$KIMI_CODE_HOME/AGENTS.md` (`~/.kimi-code/AGENTS.md`).
- Глобальные кросс-тул: `~/.agents/AGENTS.md`.
- Проектные: `AGENTS.md` или `.kimi-code/AGENTS.md`.
- Содержимое попадает в промпт как справочные данные, переменная `${agents_md}` (docs:1274, 1366). Есть предупреждение о чрезмерном размере/усечении (`agents-md-oversized`, docs:9057, 2820); порог не описан.
- `CLAUDE.md` НЕ читается (в доках нигде не указан как источник инструкций). Для общей памяти: класть в `AGENTS.md`, в `CLAUDE.md` проекта писать `@AGENTS.md`-подобную обёртку нельзя на стороне Kimi; значит, генерировать/симлинкать файл.
- Изменения AGENTS.md/skills/агентов подхватываются вотчером; `/reload` или `:reload` явно (docs:10862, 8985). Симлинки AGENTS.md поддерживаются (changelog docs:2250, 2271).
- `/init` генерирует `AGENTS.md` (docs:10864).

## 12. Старое и новое

- Версии `0.x` и `2.x` это одна кодовая линия `kimi-code` (Node.js). `2.0.0` (2026-09-17) это переименование версии, без changelog-записи о смене раскладки путей (docs:1748-1761). Сессии пользователя «0.31» в `~/.kimi-code/sessions` лежат в той же раскладке, что в доках 2.4 (real подтверждает).
- Настоящий «старый» Kimi это Python `kimi-cli` с данными в `~/.kimi/` (docs:6213-6252). `kimi migrate` переносит `config.toml`, MCP, историю ввода и выбранные сессии, не переносит OAuth и плагины; старые данные не трогает; перенесённые сессии с меткой `[imported]`.
- Изменения, которые важны интеграции:
  - 0.32.0: движок `agent-core-v2` по умолчанию в TUI, `-p`, `acp`, `export` (docs:2097); добавлены хуки `TurnStarted`, `UserPromptQueued`, `TaskStarted`, `SessionHeartbeat` (docs:2103); переименованы ключи `[loop_control]`: `max_retries_per_step` -> `max_attempts_per_step`, `max_steps_per_run` -> `max_steps_per_turn` (docs:2107).
  - 0.28.0 (breaking): дерево `kimi server` устарело, использовать `kimi web`; `kimi web` на переднем плане (docs:2238-2240). Любой `kimi server ...` печатает уведомление и выходит с кодом 1 (docs:397).
  - 0.30.0: появился `[status_line]` (docs:2154). 0.13.0: `/import-from-cc-codex` и темы (docs:3099).
  - 2.3.0: плагинные скиллы только по квалифицированному имени `<plugin>:<skill>`; хуки запускаются в проекте сессии, а не в каталоге запуска сервера (docs:1655, 1669).
  - 2.3.1: лок сессий и `KIMI_CODE_SESSION_LOCK`, take-over после падения (docs:1639).
  - 2.4.0: `/import-sessions`; Plan mode включает только пользователь; `kimi -p` не применяет `default_plan_mode` (docs:1596, 1604).
  - 2.4.1: `Read` отдаёт максимум 100 000 символов или около 25 000 токенов (docs:1585).
  - Перед 2.0: wire-протокол менялся (в real `protocol_version` "1.4"); новая версия протокола при чтении старой не ломает возобновление, показывается предупреждение (docs:3458). Явного документа «миграции wire» нет: не описано.
- Прочие расхождения от Claude для интеграции: у `~/.kimi-code` нет `skills/`, `plugins/`, `AGENTS.md`, `mcp.json`, `agents/` на этой машине (real), все создаются пользователем; в реальной раскладке добавлены `workspaces.json`, `cache/`, `device_id`, `region`, `telemetry/`, `migrations-effort.json`.

## 13. Плагины (для упаковки адаптера памяти)

- Манифест: `<root>/kimi.plugin.json` или `<root>/.kimi-plugin/plugin.json`, приоритет у первого (docs:6893-6900).
- Поля (docs:6925-6936): `name` (обяз., id), `version`, `description`, `interface`, `skills`, `agents`, `sessionStart.skill`, `skillInstructions`, `systemPrompt`, `systemPromptPath`, `mcpServers`, `hooks`, `commands`. Неподдерживаемые поля (`tools`, `apps`, `inject`, `configFile`) игнорируются с диагностикой (docs:6938).
- Хуки в манифесте: массив `{event, matcher, command, timeout}`; cwd = корень плагина; env `KIMI_CODE_HOME`, `KIMI_PLUGIN_ROOT` (docs:7107-7126).
- Установка и управление: `/plugins`; записи `plugins/installed.json`, копии `plugins/managed/<id>/` (docs:4647). Изменения применяются `/plugins reload` или в новой сессии (docs:6946, 7062).
- Безопасность: пути после разрешения симлинков не выходят за корень плагина (docs:7135).

## 14. Что остаётся проверить экспериментом

1. Полный payload `PreToolUse`/`PostToolUse`/`UserPromptSubmit`/`SessionStart`/`Stop`/`SubagentStart`: поставить хук-логгер, записать stdin.
2. Формат лок-файла в `locks/sessions/` и реестра `server/instances/` (запустить живой `kimi` и `kimi web`).
3. Точная схема сообщений `--output-format stream-json` и код выхода при ошибке.
4. Работает ли `extra_agent_dirs = ["~/.claude/agents"]` на файлах Claude Code.
5. Формат wire записей в движке 2.4.1 (версия `protocol_version` новых сессий; есть ли `role:"assistant"` сообщения).
6. Принимает ли `UserPromptSubmit` JSON с полем `message` и в каком виде (docs:1688).
