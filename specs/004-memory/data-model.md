# Data Model: Память Claude Code

Всё — файлы. Корень проекта памяти `M = ~/.claude/projects/<slug>/memory/` (R1).

```text
M/
├── MEMORY.md                      # индекс (Claude Code грузит первые 200 строк)
├── <name>.md                      # записи
├── sessions/YYYY-MM-DD_<s8>.md    # заметки сессий, s8 — первые 8 символов session_id
├── .archive/<name>.md             # удалённые и поглощённые записи
└── .reflect.log                   # имена заметок, обработанных /reflect
```

## Запись (Record)

Файл `M/<name>.md`: YAML frontmatter + тело markdown. Ключи — английские, текст — русский.

На верхнем уровне frontmatter только `name` и `description`; все остальные ключи — внутри `metadata:`. Claude Code
сам нормализует файлы памяти к этому виду и добавляет `metadata.node_type`, `originSessionId`, `modified`
(research.md «US1 на живой сессии»). Читатели берут поле из `metadata`, иначе с верхнего уровня; писатели
(Echo Studio) пишут в `metadata`. `metadata.type` в таблице ниже записан как `type`.

| Поле | Тип | Обяз. | Правило |
|------|-----|-------|---------|
| `name` | string | да | kebab-case, совпадает с именем файла без `.md` |
| `description` | string | да | одна строка, для индекса и поиска |
| `metadata.type` | `user\|feedback\|project\|reference` | да | формат auto memory, не меняем |
| `kind` | `decision\|gotcha\|bugfix\|feature\|discovery` | нет | нет — запись auto memory без плагина, показывается как есть |
| `status` | `observation\|fact` | нет | по умолчанию `observation` |
| `seen` | int ≥ 1 | нет | по умолчанию 1; `seen ≥ 2` ⇒ `status: fact` |
| `importance` | 1–3 | нет | по умолчанию 2; 3 = закреплена |
| `tags` | string[] | нет | объединяются при слиянии |
| `files` | string[] | нет | пути относительно корня проекта (US6) |
| `supersedes` | string | нет | имя записи, которую заменяет |
| `valid_to` | date `YYYY-MM-DD` | нет | задана ⇒ устарела |
| `consolidated_into` | string | нет | только в `.archive/`: имя каноничной записи |
| `updated` | date | нет | ставит Claude при записи; иначе mtime |

Неизвестные ключи сохраняются в исходном порядке. Битый YAML → построчный разбор `ключ: значение`; не
разобралось — запись с `error`, хуки её пропускают.

**Производное**: `stale = valid_to < today || есть запись с supersedes = name`; `pinned = importance == 3`.

**Жизненный цикл**:

```text
создана (observation, seen 1) ──seen++──▶ fact (seen ≥ 2, строка в «## Факты»)
    │                                      │
    ├── valid_to / supersedes ─▶ устарела ◀┘
    ├── удалена ─▶ .archive/ ──отмена──▶ на месте, строка индекса восстановлена
    └── поглощена слиянием ─▶ .archive/ + consolidated_into
```

## Заметка сессии (SessionNote)

Файл `M/sessions/YYYY-MM-DD_<s8>.md`. Дата — дня первого Stop сессии, путь фиксируется в состоянии хука.

| Поле | Тип | Правило |
|------|-----|---------|
| `name` | string | верхний уровень: `session-<s8>` |
| `description` | string | верхний уровень: заголовок — одна строка, в индексе |
| `session_id` | string | полный id |
| `capture` | `claude\|extractive` | `extractive` — черновик SessionEnd (US7) |
| `updated` | ISO datetime | время последней перезаписи |

Тело — 5 разделов в фиксированном порядке: `## Запрос`, `## Изучено`, `## Узнали`, `## Сделано`, `## Дальше`.
Черновик вместо них: `## Первый запрос`, `## Последние реплики`, `## Тронутые файлы`.

## Индекс (MEMORY.md)

Строки записей — формат auto memory: `- [Заголовок](file.md) — hook`. Структура, которую поддерживают Claude
(по инструкции) и Echo Studio:

```markdown
## Факты
- [..](fact-a.md) — ..          ← status: fact или importance: 3

- [..](obs-b.md) — ..           ← остальные строки, порядок пользователя

<!-- memory:sessions -->
- [2026-09-29 — заголовок](sessions/2026-09-29_ab12cd34.md) — дальше: …
<!-- /memory:sessions -->
```

- Управляемый блок принадлежит хуку SessionStart: 3 новейшие заметки, пересборка целиком. Вне блока хук не пишет.
- Echo Studio меняет только строки со ссылкой на конкретный файл и секцию `## Факты`; остальной текст не трогает.
- > 200 строк — предупреждение в SessionStart и в Echo Studio.

## Состояние хуков (HookState)

`%TEMP%/claude-memory/<session_id>.json`, temp → rename; ошибки — `%TEMP%/claude-memory/errors.log`.

| Поле | Тип | Смысл |
|------|-----|-------|
| `offset` | int | байтовое смещение прочитанного JSONL |
| `user_count` | int | сообщений пользователя |
| `edited` | bool | были Edit/Write/MultiEdit/NotebookEdit |
| `noted_at` | int \| null | `user_count` на момент последнего блока Stop |
| `note_path` | string \| null | путь заметки этой сессии |
| `memory_dir` | string | папка памяти (R1) |
| `file_map` | `{ [relPath]: { record, mtime }[] }` | карта `files:` для US6 |
| `injected` | string[] | файлы, по которым контекст уже подмешан |
| `first_prompt` | string \| null | для черновика US7 |
| `touched` | string[] | файлы из tool_use для черновика |
| `recent` | `{ role, text }[]` | 3 последние текстовые реплики по 500 символов для черновика |

Файлы состояния старше 7 дней удаляет SessionStart.

## Модели Echo Studio (IPC)

```ts
type MemoryProject = { slug: string; name: string; cwd: string | null; memoryDir: string;
  records: number; facts: number; sessions: number; archived: number; indexLines: number };

type MemoryRecord = { path: string; file: string; name: string; description: string;
  type: string | null; kind: string | null; status: 'observation' | 'fact'; seen: number;
  importance: 1 | 2 | 3; tags: string[]; files: string[]; supersedes: string | null;
  validTo: string | null; consolidatedInto: string | null; stale: boolean;
  updated: string; archived: boolean; error: string | null };

type SessionNote = { path: string; sessionId: string | null; title: string;
  capture: 'claude' | 'extractive'; updated: string; next: string | null; error: string | null };

type DuplicatePair = { slug: string; a: MemoryRecord; b: MemoryRecord; score: number };

type MemoryHit = { slug: string; path: string; line: number; snippet: string };

type RecordPatch = { status?: 'observation' | 'fact'; importance?: 1 | 2 | 3;
  validTo?: string | null; supersedes?: string | null };
```
