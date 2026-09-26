# Data Model: Доработки после приёмки v0.3.0

## ToolRowModel (фронт, `src/lib/tooling.ts`)

```ts
type ToolRowModel =
  | { type: 'group'; key: string; title: string; count: number; open: boolean; origin: 'plugin' | 'prefix' }
  | { type: 'item'; item: ToolItem; grouped: boolean };
```

- `key`: `plugin:<pluginKey>` | `prefix:<prefix>`; уникален в области.
- Правила: skill с `origin === 'plugin'` → группа плагина; иначе префикс = часть `name` до первого `-`
  (всё имя, если `-` нет), группа при ≥3 skills с префиксом; одиночки — `grouped: false`.
- Сортировка верхнего уровня — по `title` группы / имени skill вместе; внутри группы — текущий порядок.
- Пустая группа (после поиска/фильтра) не выводится.

## UiState (дополнения, persist)

| Поле | Тип | По умолчанию | Persist |
|---|---|---|---|
| `toolsOpenGroups` | `string[]` | `[]` | да |
| `toolsDuplicatesOnly` | `boolean` | `false` | нет; сброс при смене области |

## AskQuestion (фронт, `src/lib/ask-question.ts`)

```ts
interface AskOption { label: string; description: string | null; picked: boolean }
interface AskQuestion {
  header: string | null;
  question: string;
  multiSelect: boolean;
  options: AskOption[];
  other: string | null;       // свой ответ
  notes: string | null;       // annotations[q].notes
}
interface AskCard { questions: AskQuestion[]; answered: boolean; rawResult: string | null }
```

- `answered = false` → «No answer»; `rawResult` заполняется, когда ответ не разобран (FR-011).

## Conflict (Rust, `tooling/effective.rs`)

Без новых значений: `SameName` теперь ставится и skills плагинов; источник группы — (origin, pluginKey).

## MissingScope (фронт)

Производные поля из `ScopeRef` (`available === false`) и `ConversationProject`: путь, `sessionCount`
(0, если проекта нет среди Conversations), `projectId | null` для перехода.
