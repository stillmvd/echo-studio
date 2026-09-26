# Research: Обзор инструментов Claude

Источники: документация Claude Code (code.claude.com/docs/en/{skills, sub-agents, settings, plugins/*, mcp}.md,
2026-09-26) и реальные файлы на машине пользователя (`~/.claude`, `~/.claude.json`, проекты).

## R1. Где что лежит

- **Decision**: сканируем такие источники:
  - skills — `~/.claude/skills/<dir>/SKILL.md`, `<project>/.claude/skills/<dir>/SKILL.md`,
    `<plugin>/skills/<dir>/SKILL.md`;
  - commands (легаси, но поддерживаются) — `~/.claude/commands/**/*.md`, `<project>/.claude/commands/**/*.md`,
    `<plugin>/commands/**/*.md`; подпапка = пространство имён `dir:name`;
  - agents — `~/.claude/agents/**/*.md`, `<project>/.claude/agents/**/*.md`, `<plugin>/agents/**/*.md`;
  - plugins — `~/.claude/plugins/installed_plugins.json` (`plugins["name@marketplace"] = [{scope, installPath,
    version, installedAt, lastUpdated}]`), файлы плагина — `installPath`; манифест
    `<installPath>/.claude-plugin/plugin.json` необязателен (name, version, description);
  - MCP — user: `~/.claude.json` → `mcpServers`; local: `~/.claude.json` → `projects[<path>].mcpServers`;
    project: `<project>/.mcp.json` → `mcpServers`; plugin: `<installPath>/.mcp.json` → `mcpServers`.
- **Rationale**: ровно те места, которые документирует и читает Claude Code; подтверждено файлами пользователя
  (5 плагинов в `installed_plugins.json`, `.mcp.json` в Breezee, Smart Control, Horizon, Scrolly, Strategym).
- **Alternatives**: запускать `claude mcp list` / `claude plugin list` — отвергнуто: медленно, требует CLI в PATH,
  не даёт skills/agents, нарушает «только чтение без побочных эффектов».

## R2. Имя и описание элемента

- **Decision**: skill — `name` из front matter, иначе имя папки; command — путь относительно `commands/` без
  `.md`, подпапки через `:`; agent — `name` из front matter, иначе имя файла. У элементов плагина — префикс
  `<plugin>:`. Описание — `description` из front matter (для skill также `when_to_use`, если есть).
  Front matter — YAML между `---`; разбор тем же `serde_yaml`, что уже в проекте.
- **Rationale**: так Claude Code формирует имена (skills.md, sub-agents.md).
- **Alternatives**: брать первую строку markdown как описание — только запасной вариант, если `description` нет.

## R3. Включение и выключение

| Что | Глобально | Для проекта (личное) | Значение |
|-----|-----------|----------------------|----------|
| Plugin | `~/.claude/settings.json` → `enabledPlugins["name@mkt"]` | `<project>/.claude/settings.local.json` → `enabledPlugins` | `true` / `false` |
| Skill (свой, не из плагина) | `~/.claude/settings.json` → `skillOverrides[name]` | `<project>/.claude/settings.local.json` → `skillOverrides[name]` | `"off"` / удалить ключ (= `on`) |
| MCP user/local | `~/.claude.json` → `disabledMcpServers[]` | `~/.claude.json` → `projects[path].disabledMcpServers[]` | добавить / убрать имя |
| MCP из `.mcp.json` | — | `<project>/.claude/settings.local.json` → `disabledMcpjsonServers[]` | добавить / убрать имя |

- **Decision**:
  - Переключатели есть у плагинов, у своих skills (user и project) и у MCP-серверов user/local/project.
  - Skills и MCP из плагина, commands и agents — без переключателя; подсказка: «выключается вместе с плагином»
    или «Claude Code не умеет выключать этот тип».
  - Прочие значения `skillOverrides` (`name-only`, `user-invocable-only`) показываются как есть и сохраняются;
    переключатель переводит их только в `off` и обратно в отсутствие ключа.
  - Уточнение к решению «только личные настройки проекта»: для MCP-серверов уровня user/local выключение для
    проекта по документации хранится в записи проекта внутри `~/.claude.json` — это тоже личный, не общий файл.
    Общий `<project>/.claude/settings.json` приложение не меняет никогда.
- **Rationale**: всё — штатные ключи Claude Code; `skillOverrides`, `enabledPlugins`, `enableAllProjectMcpServers`
  уже используются в настройках пользователя.
- **Alternatives**: перенос папок skills — отвергнуто решением пользователя; ключи для плагинных MCP не
  документированы.

## R4. Итог «что видит Claude в проекте»

- **Decision**: итог = user + project + local + включённые плагины, с учётом выключателей из всех слоёв настроек
  в порядке Claude Code: local > project (общий) > user. Managed-настройки и флаг `--settings` не учитываются.
  Совпадения имён:
  - agents — проектный перекрывает пользовательский (задокументировано);
  - skills и commands с одинаковым именем в user и project — помечаются «совпадение имён» у обоих, без утверждения,
    какой победит (в документации правило не описано);
  - элементы плагинов не конфликтуют — у них своё пространство имён.
- **Rationale**: SC-002 требует не выдумывать — показываем только то, что можем обосновать.
- **Alternatives**: считать, что project всегда побеждает — отвергнуто: не задокументировано для skills.

## R5. Запись без потерь

- **Decision**:
  - JSON читается и пишется через `serde_json` с фичей `preserve_order`: порядок и неизвестные ключи сохраняются.
    Отступ — 2 пробела, как у Claude Code.
  - Перед записью файл перечитывается, меняется один ключ; копия исходника идёт в
    `%APPDATA%/<app id>/config-backups/<имя-файла>/<YYYYMMDD-HHMMSS>.json`, хранятся последние 20.
  - Затем запись во временный файл рядом с целью и переименование.
  - Отсутствующий `settings.local.json` создаётся с одним ключом (копии нет — нечего копировать).
- **Rationale**: принцип I конституции; `~/.claude.json` Claude Code переписывает часто — окно гонки сводим
  к миллисекундам между чтением и переименованием.
- **Alternatives**: текстовые правки по регулярным выражениям — хрупко; блокировки файла — Claude Code их не
  соблюдает.

## R6. Слежение за изменениями

- **Decision**: `notify` + `notify-debouncer-mini` (уже в проекте), 500 мс.
  - Рекурсивно: `~/.claude/skills`, `~/.claude/commands`, `~/.claude/agents`.
  - Без рекурсии: `~/.claude/settings.json`, `~/.claude/plugins/installed_plugins.json`, `~/.claude.json`.
  - Для каждого известного проекта — `.claude/` рекурсивно и `.mcp.json`.
  - Событие `tooling://changed` без полезной нагрузки; фронтенд инвалидирует запросы.
  - `~/.claude.json` меняется при каждой сессии Claude: после перечитывания сравниваем срез с MCP-ключами и не
    шлём событие, если он не изменился.
- **Rationale**: SC-005 (≤ 2 с), без лишних перерисовок.
- **Alternatives**: опрос по таймеру — дороже и медленнее.

## R7. Список проектов

- **Decision**: объединение cwd проектов из Conversations (уже вычисляется сканером) и ключей
  `~/.claude.json` → `projects`. Нормализация путей: регистр диска, `/` → `\`, без конечного разделителя.
  Проект, чьей папки нет, — «недоступен», его файлы не читаются.
- **Rationale**: решение пользователя; в `~/.claude.json` 50 проектов, часть удалена с диска.

## R8. Удаление EchoVault

- **Decision**:
  - Rust: удалить модуль `echovault/`, `commands/memories.rs`, `state.rs`, команды `read_echovault_config` и
    `trigger_reindex`, слежение за `index.db` в `lib.rs`. Из `open_in_claude_code` убрать чтение конфига
    EchoVault. Зависимости `rusqlite`, `sqlite-vec`, `reqwest` удалить; `serde_yaml` остаётся (front matter).
  - Фронтенд: удалить `components/memories/*`, `MemoriesLayout`, хуки memories, db-watcher, reindex и
    `ui/Select.tsx`; `StatusBar` переходит на слежение за конфигом Claude; из Settings убрать секции EchoVault и
    Backups; вкладка `memories` в сторе заменяется на `tools`.
  - Переименования сессий (`~/.claude/echo-studio-titles.json`) к EchoVault не относятся — остаются.
- **Rationale**: FR-018, FR-019; у пользователя EchoVault нет, миграция не нужна.

## R9. Секреты MCP

- **Decision**: значения `env` и `headers` приходят во фронтенд как есть и маскируются в UI (`••••••`), раскрытие —
  по клику на конкретное значение, до смены элемента. В логи и ошибки значения не попадают.
- **Rationale**: приложение локальное, данные уже лежат в файлах пользователя; маска защищает от случайного показа
  на экране (демонстрация, скриншот).
- **Alternatives**: раскрытие через отдельную IPC-команду — лишняя сложность без выигрыша в безопасности.
