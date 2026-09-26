# Data Model: Обзор инструментов Claude

Все сущности живут в памяти и строятся из файлов при каждом скане; собственного хранилища нет, кроме копий
файлов настроек (R5).

## ScopeRef

Область, в которой смотрим.

| Поле | Тип | Правила |
|------|-----|---------|
| kind | `global` \| `project` | |
| path | string \| null | для `project` — нормализованный абсолютный путь (R7) |
| name | string | `Global` или имя проекта как в Conversations (последняя папка cwd) |
| available | bool | `false`, если папки нет — файлы проекта не читаются |

Список областей: `Global` первым, затем проекты (объединение Conversations и `~/.claude.json`), сортировка —
как в панели проектов Conversations.

## ToolItem

| Поле | Тип | Правила |
|------|-----|---------|
| id | string | стабильный ключ: `<kind>:<origin>:<qualifiedName>`; уникален в пределах итога |
| kind | `skill` \| `command` \| `agent` \| `plugin` \| `mcp` | |
| name | string | имя без пространства имён (R2) |
| qualifiedName | string | с префиксом плагина `plugin:name` или подпапки `dir:name` |
| description | string \| null | из front matter / манифеста; для MCP — null |
| origin | `user` \| `project` \| `local` \| `plugin` | `local` — только MCP из `~/.claude.json` → `projects[path]` |
| pluginKey | string \| null | `name@marketplace`, если origin = `plugin` |
| filePath | string \| null | основной файл: SKILL.md, .md команды/агента, plugin.json или папка плагина, файл с объявлением MCP |
| state | `enabled` \| `disabled` \| `unavailable` \| `error` | `unavailable` — выключен родительский плагин или плагин не установлен |
| overrideMode | string \| null | для skill: значение `skillOverrides`, если не `on` (`off`, `name-only`, `user-invocable-only`) |
| toggle | ToggleTarget \| null | null — выключать нельзя; тогда `toggleHint` объясняет почему |
| toggleHint | string \| null | «выключается вместе с плагином», «Claude Code не выключает commands» и т. п. |
| conflict | `none` \| `overrides` \| `overridden` \| `sameName` | только в итоге проекта (R4) |
| error | string \| null | текст ошибки чтения (битый front matter, JSON) |

### Дополнительно по видам

В JSON — вложенными объектами `plugin`, `mcp`, `frontMatter` (null у других видов).

- **plugin**: `version`, `marketplace`, `installedAt`, `lastUpdated`, `installPath`, `contents` — счётчики skills,
  commands, agents, mcp, hooks (hooks только числом, вне объёма фичи).
- **mcp**: `transport` (`stdio` \| `http` \| `sse`), `command`, `args[]`, `url`, `env` (map), `headers` (map),
  `declaredIn` (путь файла и JSON-путь, например `~/.claude.json › projects › C:\…\Breezee › mcpServers`).
- **skill/command/agent**: `frontMatter` (map как есть — для деталей), `bodyPreview` не передаётся в списке;
  полный текст — отдельной командой чтения (contracts).

## ToggleTarget

Куда пишет переключатель (R3). Приходит с бэкенда, фронтенд его только возвращает в команду записи.

| Поле | Тип | Правила |
|------|-----|---------|
| file | `userSettings` \| `projectLocalSettings` \| `claudeJson` | общий `.claude/settings.json` проекта не допускается |
| projectPath | string \| null | для `projectLocalSettings` и проектного ключа в `claudeJson` |
| key | `enabledPlugins` \| `skillOverrides` \| `disabledMcpServers` \| `disabledMcpjsonServers` | |
| name | string | `name@marketplace`, имя skill или имя MCP-сервера |

Переходы: `enabled → disabled` пишет `false` / `"off"` / добавляет имя в массив; `disabled → enabled` пишет `true` /
удаляет ключ из `skillOverrides` / убирает имя из массива. Если после удаления объект или массив пуст — оставляем
пустым, файл и ключ не удаляем.

## EffectiveSet (итог проекта)

Список `ToolItem` для области проекта: user + project + local + элементы включённых плагинов; состояние каждого
считается по слоям настроек local > project > user (R4). Флаг «только проектное» — фильтр по
`origin ∈ {project, local}` на фронтенде.

## ScanResult

Ответ скана области.

| Поле | Тип | Правила |
|------|-----|---------|
| scope | ScopeRef | |
| items | ToolItem[] | |
| sources | SourceStatus[] | по одному на прочитанный файл/папку: путь, `ok` \| `missing` \| `error`, текст ошибки |
| counts | map kind → number | для счётчиков фильтра |

## ConfigBackup

| Поле | Тип | Правила |
|------|-----|---------|
| file | string | исходный путь |
| backupPath | string | `%APPDATA%/<app id>/config-backups/<slug файла>/<YYYYMMDD-HHMMSS>.json`, при коллизии `-2`, `-3` |
| createdAt | string | ISO UTC |
| sizeBytes | number | |

Хранится 20 последних на исходный файл; старше — удаляются после успешной записи новой копии.
