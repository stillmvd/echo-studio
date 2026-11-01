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

## Фаза 4 — Рабочее место для Kimi (FR-K04)

Запуск `kimi` / `kimi -S <id>` прямо в portable-pty (демона и attach у Kimi нет); список сессий — `session_index.jsonl` + `state.json` + `locks/sessions`; статус — те же `~/.claude/state/sessions` (session-status.js уже пишет для Kimi).

## Фаза 5 — Инструменты и Переписки (FR-K05, FR-K06)

Инструменты: `~/.kimi-code/{skills,agents,mcp.json,plugins/installed.json}`, `extra_*_dirs`, `~/.agents/skills`, проектные `.kimi-code/`. Переписки: `wire.jsonl` только на чтение.

## Фаза 6 — переключение (FR-K07)

Экран «Переход на Kimi»: состояние синхронизации, вход в Kimi (`kimi login`), `kimi-sync --all`, переключение агента в Echo, `/import-sessions`, обратный ход.
