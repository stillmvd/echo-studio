# IPC contract

## `list_tool_copies` (новая)

- **Args**: нет.
- **Returns**: `ToolCopy[]` (см. data-model.md), camelCase.
- **Roots**: `~/.claude` (Global); `<project>/.claude` для каждого `available` проекта из `known_scopes`, кроме
  совпадающего с `~/.claude`; `installPath` каждого установленного плагина. Другие пути не читаются.
- **Behaviour**: `spawn_blocking`; нечитаемый файл — запись с `hash: null`, `modifiedMs: null`; отсутствующие
  папки пропускаются молча; никаких записей.

## `scan_tool_scope` (изменение ответа)

- `ToolItem.conflict` больше не принимает `sameName`.
- Новые поля `ToolItem.overriddenBy: string | null`, `ToolItem.overrides: string[]`.

## Без изменений

- `reveal_in_explorer(path)` — «Show in folder» для места копии.
