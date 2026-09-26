# Data Model

## ToolItem (изменение)

| Поле | Было | Стало |
|---|---|---|
| `conflict` | `none \| overrides \| overridden \| sameName` | `none \| overrides \| overridden` |
| `overriddenBy` | — | `"global" \| "project" \| "local" \| "skill" \| null` — у проигравшего |
| `overrides` | — | `string[]` — источники проигравших у победителя (те же значения), пусто иначе |

Правила (`mark_conflicts`):

- Участники: `state == enabled`, `origin != plugin`, `kind != plugin`.
- Skills и commands — одна группа по `name.toLowerCase()`; ранг: skill user 4, skill project 3, command
  user 2, command project 1. Победитель — максимальный ранг.
- Agents — группа по имени; ранг project 2, user 1. MCP — local 3, project 2, user 1.
- Метка источника для проигравшего: если победитель skill, а проигравший command — `skill`; иначе origin
  победителя (`user` → `global`). У победителя `overrides` — метки проигравших, по тому же правилу
  (`command` если проигравший — команда при победителе-skill).

## ToolCopy (новое, ответ `list_tool_copies`)

| Поле | Тип | Смысл |
|---|---|---|
| `kind` | `skill \| command \| agent` | тип |
| `name` | string | короткое имя как в `ToolItem.name` |
| `scope` | `{ kind: 'global' \| 'project' \| 'plugin', path: string \| null, label: string }` | где лежит; label — имя проекта или плагина, «Global» |
| `filePath` | string | файл (`SKILL.md` для skill) |
| `hash` | string \| null | хэш содержимого; `null` — не прочитан |
| `modifiedMs` | number \| null | mtime, мс Unix |

Производные (фронтенд, `src/lib/tooling.ts`):

- `copiesFor(item, copies)` — копии с тем же `kind` и именем без учёта регистра, кроме файла `item.filePath`,
  кроме области текущего скана; порядок: Global, проекты по имени, плагины.
- `alsoInProjects(item, copies, scopePath)` — число различных проектов среди `copiesFor`, только для
  `origin ∈ {project, local}`.
- `same` — `copy.hash !== null && copy.hash === hash файла item` (хэш item берётся из того же индекса по
  `filePath`).

## AgentNotice (новое, `src/lib/agent-notice.ts`)

| Поле | Тип |
|---|---|
| `summary` | string \| null — описание агента (из `Agent "…" finished` — текст в кавычках) |
| `status` | string — `completed`, `failed`, `killed`, `stopped`, `running` или как есть |
| `result` | string \| null — отчёт, markdown |

Узел ленты: `{ type: 'agent'; key; item; notice: AgentNotice }`.

## UI state (`ui-store`)

- `toolsOverriddenOnly: boolean` (заменяет `toolsDuplicatesOnly`).
- `toolsInheritedOpen: boolean` (по умолчанию `false`).
- Удалить `toolsProjectOnly`.
