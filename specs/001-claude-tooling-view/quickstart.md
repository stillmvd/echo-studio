# Quickstart: проверка фичи «Обзор инструментов Claude»

## Подготовка

- Windows, Claude Code настроен (`~/.claude/skills`, `~/.claude/settings.json`, `~/.claude.json`).
- `pnpm install`; dev: `pnpm tauri dev` (для CDP — см. CLAUDE.md проекта).
- Автопроверки: `pnpm biome check .`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`,
  `cargo test --manifest-path src-tauri/Cargo.toml`.

## Сценарии

1. **Без EchoVault (US4, SC-006)**: запустить приложение без `~/.memory`. Рейл: tools, Conversations, Settings.
   В интерфейсе нет «EchoVault», «memories», «Reindex». Папка `~/.memory` не создана.
2. **Global (US1, SC-001)**: открыть вкладку tools. Счётчики типов совпадают с
   `ls ~/.claude/skills | wc -l`, `ls ~/.claude/agents`, `ls ~/.claude/commands` и `installed_plugins.json`.
   Выбор «MCP» — только 3 сервера (chrome-devtools, codebase-memory-mcp, inkscape). Поиск «cloud» сужает список.
3. **Детали (US1)**: открыть skill — описание и отформатированный SKILL.md; открыть MCP — команда и аргументы,
   `env` скрыт; клик по значению — раскрыт.
4. **Итог проекта (US2, SC-002)**: выбрать Breezee — видны проектные skills и серверы из `.mcp.json` с меткой
   «проект», глобальные — с меткой «global». В сессии Claude Code в этом проекте `/mcp` и список skills совпадают.
5. **Переключатель плагина (US3, SC-004)**: выключить `ponytail@ponytail` глобально. В
   `~/.claude/settings.json` изменилась только `enabledPlugins["ponytail@ponytail"]`; в Settings появилась копия;
   элементы плагина помечены недоступными. Включить обратно.
6. **MCP для проекта (US3)**: выключить chrome-devtools в проекте Breezee — изменился только
   `~/.claude.json › projects › …Breezee › disabledMcpServers`; в других проектах сервер включён.
   `Breezee/.claude/settings.json` не изменился (`git status` в Breezee чистый).
7. **Ошибка записи (US3)**: открыть `settings.json` на запись в другой программе с блокировкой → переключатель
   вернулся, показана причина, файл цел.
8. **Автообновление (US5, SC-005)**: при открытой вкладке создать `~/.claude/skills/tmp-check/SKILL.md` с
   `description` — элемент появился ≤ 2 с; удалить папку — исчез.
9. **Битый файл (SC-007)**: в тестовом skill испортить front matter — элемент с пометкой ошибки, остальные на месте.
