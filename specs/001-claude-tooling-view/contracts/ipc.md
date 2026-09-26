# IPC-контракт: Обзор инструментов Claude

Команды Tauri (`invoke`), типы — из [data-model.md](../data-model.md). Ошибки — строка (`Result<T, String>` на
границе IPC). Все команды с файловым I/O выполняются в `spawn_blocking`.

## Чтение

### `list_tool_scopes() -> ScopeRef[]`
Global + проекты (Conversations ∪ `~/.claude.json`). Недоступные проекты включены с `available: false`.

### `scan_tool_scope(scope: { kind, path }) -> ScanResult`
- `global` — элементы user-уровня и все установленные плагины с их содержимым.
- `project` — итог проекта (EffectiveSet) с `conflict`.
- Путь проекта должен быть в списке `list_tool_scopes`, иначе ошибка `unknown project`.

### `read_tool_file(path: string) -> { text: string, truncatedAt: number | null }`
Текст основного файла элемента для деталей. Guard: путь внутри разрешённых корней (`~/.claude`, известные проекты,
`installPath` плагинов), расширение `.md` или `.json`, размер > 512 KB — обрезается с `truncatedAt`.

## Запись

### `set_tool_enabled(target: ToggleTarget, enabled: boolean) -> ToolItem`
1. Проверить `target`: `file` ∈ {userSettings, projectLocalSettings, claudeJson}, `projectPath` — известный проект,
   `key` согласуется с `file` (таблица R3).
2. Перечитать файл, применить одно изменение, копию исходника в `config-backups`, записать temp → rename.
3. Вернуть пересчитанный элемент. При ошибке файл не тронут, ошибка — текстом с причиной.

### `list_config_backups() -> ConfigBackup[]`
Для Settings, новые сверху.

## Прочее (существующие, без изменений контракта)

- `reveal_in_explorer(path)` — дополнительно принимает пути из разрешённых корней фичи.
- `list_conversation_projects()` — источник cwd проектов.

## Событие

### `tooling://changed` (payload: none)
Отправляется watcher'ом после дебаунса 500 мс при изменении файлов конфигурации (R6). Фронтенд инвалидирует
запросы `['tooling', …]`. Шум `~/.claude.json` (без изменения MCP-ключей) события не вызывает.

## Удаляются

`list_memories`, `get_memory`, `archive_memory`, `restore_memory`, `delete_memory`, `bulk_*_memories`,
`list_db_backups`, `manual_backup`, `update_memory`, `trigger_reindex`, `read_echovault_config`, событие
`echovault://changed`.
