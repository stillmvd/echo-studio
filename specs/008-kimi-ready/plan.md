# 008 — план

Ветка `feat/kimi-ready`, worktree `.claude/worktrees/kimi-ready`. Тестовый Kimi — `KIMI_CODE_HOME` во временной папке, модель Ollama `qwen3-32k` (`qwen3:4b` + `num_ctx 32768`).

## Фаза 1 — echo-memory в Kimi ✓ (FR-K01)

- `plugin/kimi.plugin.json`: хуки SessionStart, UserPromptSubmit, PostToolUse (Write|Edit), Stop, SessionEnd; команды `./commands/`. `pre-read` не регистрируется — Kimi не принимает контекст из PreToolUse.
- `plugin/lib/agent.mjs`: распознавание по `client_type`, нормализация payload (`prompt` → текст, `path` → абсолютный `file_path`, `transcript_path` → `wire.jsonl`), очередь отложенного контекста: отдаётся на следующем UserPromptSubmit или блоком Stop.
- `plugin/lib/transcript.mjs`: `readTranscript` переводит записи `wire.jsonl` в форму Claude для `tally`.
- Проверено живым Kimi: закреплённая запись памяти дошла до модели на первом промпте.

## Фаза 2 — синхронизация ✓ (FR-K02, FR-K07 частично)

- `plugin/lib/kimi-sync.mjs` на каждом SessionStart (и в Claude, и в Kimi), только при изменениях:
  - `~/.kimi-code/AGENTS.md` ← `~/.claude/CLAUDE.md` + output style;
  - `config.toml`: блок `echo-sync: top` (`extra_skill_dirs`, `extra_agent_dirs` → живые `~/.claude/skills|agents` и проектные `.claude/skills|agents`), блок `echo-sync: hooks` ← хуки `settings.json` (без `artifact-open-firefox` и `subagent-model-guard`);
  - `mcp.json` ← `mcpServers` из `~/.claude.json`;
  - `skills/<команда>` ← `~/.claude/commands/**` (помечены, чужие не трогаются, удалённые убираются);
  - проект: `.kimi-code/AGENTS.md` ← `CLAUDE.md` (+ `CLAUDE.local.md`), `.kimi-code/mcp.json` ← `.mcp.json`; `.kimi-code/` в глобальном gitignore;
  - плагин: при смене отпечатка — фоновая переустановка через `kimi web` API (снять → удалить копию → поставить; иначе EPERM на Windows).
- Статус — `~/.kimi-code/echo-sync.json`. Ручной запуск: `node plugin/bin/kimi-sync.mjs [--all] [--project <dir>] [--plugin]`.
- Гварды из `~/.claude/hooks` отвечают `permissionDecision: deny` — Kimi понимает без переделки; хуки исполняются через Git Bash.

## Фаза 3 — профиль агента в Echo Studio (FR-K03)

Rust: `agent` модуль — `AgentKind { Claude, Kimi }`, пути данных, CLI, форматы; настройка «Агент» (Claude по умолчанию) в Settings. Существующие модули берут пути из профиля.

Сделано:
- `src-tauri/src/agent.rs`: `Profile { home, settings, mcp, plugins, sessions, instructions, project_dir, exe, bin, transcript, has_daemon }`, `Profile::of(kind, home)` (Kimi — `KIMI_CODE_HOME` или `~/.kimi-code`), `find_cli`/`cli` (PATH → `bin`), `resume_args` (`--resume` / `-S`). Общие для обоих: `status_dir` (`~/.claude/state/sessions`), `memory_root` (`~/.claude/projects`).
- Выбор агента — `%APPDATA%/<app id>/agent.json` (`{"agent":"claude"}`, temp → rename, битый или нет файла — Claude), грузится в `setup`. IPC `get_agents`, `set_agent` (событие `echo://agent-changed`).
- Модули переведены на профиль Claude без смены поведения: `tooling/paths.rs` (адаптер `claude_dir`/`claude_json`/`user_settings`/`installed_plugins`/`project_dir`), `actions`, `effective`, `inventory`, `updates`, `watch`, `write`; `workbench/{sessions,terminal,processes,usage}`; `conversations/{paths,titles}`; `memory::projects_root`; `open_in_claude_code` собирает команду из профиля (параметр `agent`, по умолчанию Claude).
- Settings: раздел «Агент» — переключатель Claude Code / Kimi Code (Kimi недоступен без `kimi.exe`), путь CLI и папка данных каждого; «Конфиг Claude» и «Сессии» берут пути из профиля, а не собирают их в JS.
- Решение: пока фазы 4–5 не готовы, модули работают с профилем Claude явно (`Profile::claude`, `agent::claude()`), а не с выбранным агентом — выбор Kimi ничего не ломает. Ветка не выпускается до фазы 6.

Инвентарь на фазы 4–5 (что ещё зашито под Claude):
- Rust, `workbench/processes.rs`: классификация по `claude.exe` (демон, `--bg-pty-host`, `claude-itself`, `attach`) — для Kimi нужен `kimi.exe` без демона; `workbench/dev.rs:41` — `claude.exe` в списке «не dev».
- Rust, `workbench/sessions.rs`: `claude agents --json`, `--bg`, `stop`/`rm`, `daemon.log`; `terminal.rs` — `attach <id8>`. Для Kimi — `kimi`/`kimi -S` прямо в pty.
- Rust, `workbench/usage.rs` (`claude_slug`, транскрипты `~/.claude/projects`), `tooling/runs.rs` — формат JSONL Claude.
- Rust, `tooling/*`: `.claude-plugin/`, `known_marketplaces.json`, CLI `claude plugin|mcp`, ключи `enabledPlugins`/`skillOverrides`/`disabledMcp*`.
- Фронт, `src/lib/workbench.ts` (23), `components/workbench/*` (Cell 19, QuickSwitch, RunningList, useStartSession, externalSession, Wall, ClaudeTerminal): тексты «Claude», команды `claude --bg`, короткий id из 8 hex.
- Фронт, `components/dashboard/DashboardLayout.tsx`, `conversations/*`, `tools/ToolPanel.tsx`, `memory/*`: подписи «Claude» и пути `~/.claude` в текстах.

## Фаза 4 — Рабочее место для Kimi (FR-K04)

Запуск `kimi` / `kimi -S <id>` прямо в portable-pty (демона и attach у Kimi нет); список сессий — `session_index.jsonl` + `state.json` + `locks/sessions`; статус — те же `~/.claude/state/sessions` (session-status.js уже пишет для Kimi).

Решение владельца: сессия Kimi живёт, пока открыт Echo. Закрыл вкладку — работает дальше и видна в «Запущено»; закрытие Echo — диалог «N сессий Kimi остановятся» и стоп; продолжить — `kimi -S <id>`.

Сделано:
- `src-tauri/src/workbench/kimi.rs`: реестр `HOSTS` — процесс `kimi` в pty под своим 8-hex short id, буфер вывода 2 МБ (переподключение вкладки = буфер + живой поток), id терминала с префиксом `k`. Id сессии — из `locks/sessions/<id>.lock` по `pid` (lock переживает процесс, поэтому живость проверяется по `kimi.exe`); до первого сообщения id = short id, вкладку переименовывает `movedTabs`. Название — `title` из `state.json`. Внешние сессии Kimi — lock с живым `kimi.exe`, cwd из `session_index.jsonl`. Стоп — `taskkill /T /F`.
- Команды Рабочего места маршрутизируются на `HOSTS` по выбранному агенту, `is_hosted`, `kimi::is_session_id` и префиксу терминала; `list()` при Kimi — `kimi::list`, при Claude — прежний список + сессии Kimi из Echo. Поле `agent` у сессии.
- `lib.rs`: `CloseRequested` при живых Kimi — `prevent_close` + `echo://confirm-close`; `quit_stopping_kimi`. Фронт: `CloseGuard`, подписи «Новая сессия {агент}», `agentName(session)`.
- Живая проверка (dev `.check`, `KIMI_CODE_HOME` = тестовый дом с Ollama): старт из UI, доверие папке, ответ модели, связь с id через lock, скрыть вкладку и открыть из «Запущено» с восстановлением экрана, «Завершить», `kimi -S`, закрытие Echo с диалогом.
- Не сделано: классификация `kimi.exe` в `workbench/processes.rs` (сессии из Echo — его дерево и так исключены; внешние `kimi.exe` пока без особой роли).

## Фаза 5 — Инструменты и Переписки (FR-K05, FR-K06)

Инструменты: `~/.kimi-code/{skills,agents,mcp.json,plugins/installed.json}`, `extra_*_dirs`, `~/.agents/skills`, проектные `.kimi-code/`. Переписки: `wire.jsonl` только на чтение.

## Фаза 6 — переключение (FR-K07)

Экран «Переход на Kimi»: состояние синхронизации, вход в Kimi (`kimi login`), `kimi-sync --all`, переключение агента в Echo, `/import-sessions`, обратный ход.
