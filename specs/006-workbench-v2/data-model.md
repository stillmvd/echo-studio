# Data Model: Рабочее место v2

Дополнения к [005 data-model.md](../005-workbench/data-model.md). Хранилищ нет; своё состояние — zustand `persist`
`echo-workbench` версии 3.

## ClaudeSession (дополнение)

| Поле | Тип | Правило |
|------|-----|---------|
| `status` | … \| `exited` | завершённая внешняя сессия (R-02) |
| `exitedAt` | number \| null | `updatedAt` файла хука для завершённых внешних; иначе `null` |

Инварианты: `kind: external` + `status: exited` → `shortId: null`, `pid: null`, `projectPath` не `null`.

## FocusResult

`'focused' | 'vscode' | 'not-found'` — результат `focus_session_window`.

## ProcessRow (без изменений)

`projectPath` для процессов из корня `Projects` = путь корня; фронт узнаёт корень по `ProjectTree.root` (новое поле:
`root: string`, путь `C:\Users\stillmvd\Projects`).

## ProcessGroups (фронт, `lib/overview.ts`)

```ts
interface SessionGroup { sessionId: string; name: string; status: SessionStatus | null; rows: ProcessRow[]; memory: number }
interface ProcessGroup { key: string | null; rows: ProcessRow[]; sessions: SessionGroup[]; memory: number }
```

`stray` — только `orphan.reason === 'no-project'`; `session-closed` и `duplicate` — в группе своего проекта с пометкой.
`orphans(rows)` — все `orphan && !guard` по всем группам: цель «Завершить все висящие».

## WorkbenchState v3

```ts
mode: 'project' | 'wall';                       // по умолчанию 'project'
hiddenProjects: string[];                       // пути, скрытые из дерева вручную
projectLayouts: Record<string, ProjectLayout>;  // ключ — path проекта

interface ProjectLayout {
  layout: WallLayout;                           // '1x1' | '2x1' | '2x2'
  cells: ProjectCell[];                         // всегда 4
  focus: number;                                // индекс фокусной ячейки 0..3
}
interface ProjectCell { tabs: string[]; active?: string }
```

Остальные поля 005 (`view`, `openGroups`, `tabs`, `activeTab`, `recency`, `seen`, `layout`, `cells`, `focusCell`) —
без изменений; `layout`/`cells`/`focusCell` относятся к пульту.

Инварианты:

- `tabs[path]` — источник истины об открытых вкладках проекта; `projectLayouts[path].cells[*].tabs` — разбиение этого
  списка: каждая вкладка ровно в одной ячейке, лишних нет. Нормализация при каждом чтении (`normalizeLayout`).
- `active` ячейки ∈ её `tabs`, иначе последняя вкладка ячейки.
- Ячейки за пределами `CELL_COUNT[layout]` вкладок не держат: при уменьшении раскладки их вкладки переезжают в последнюю
  видимую ячейку (в конец).
- Новая вкладка (`openTab`) в режиме «Проект» → ячейка `focus`; в режиме «Пульт» — как в 005.

Действия (новые): `setMode`, `setProjectLayout(path, layout)`, `moveTab(path, key, toCell, index?)`,
`focusProjectCell(path, index)`, `activateInCell(path, cell, key)`, `hideProject(path)`, `unhideProject(path)`.

Миграция v2 → v3: `mode: 'project'`, `hiddenProjects: []`, `projectLayouts` — для каждого `path` в `tabs` с непустым
списком: `{ layout: '1x1', cells: [{ tabs: [...], active: activeTab[path] }, {tabs: []}, {tabs: []}, {tabs: []}],
focus: 0 }`.

## Контекстное меню

```ts
type MenuItem =
  | { label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; hint?: string; onSelect: () => void }
  | { label: string; icon?: ReactNode; items: MenuItem[] }   // подменю
  | 'separator';
```

Контексты (`menus.ts`): `project` (путь), `sessionTab` (path, key, shortId, live), `devTab` (path, server),
`process` (row), `running` (session | dev).
