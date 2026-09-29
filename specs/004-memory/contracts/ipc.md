# IPC-контракт: раздел памяти Echo Studio

Команды Tauri (`invoke`), типы — из [data-model.md](../data-model.md#модели-echo-studio-ipc). Ошибки — строка.
Все команды с файловым I/O — в `spawn_blocking`. Guard каждого пути: `ensure_allowed` внутри
`~/.claude/projects`, в пути есть компонент `memory`, расширение `.md`; `slug` — существующая папка
`~/.claude/projects/<slug>/memory`.

## Чтение

### `list_memory_projects() -> MemoryProject[]`
Папки `~/.claude/projects/*/memory`. Имя — из cwd сессий (сканер Conversations), иначе slug. Сортировка по
последнему изменению.

### `list_memory(slug: string) -> { records: MemoryRecord[], sessions: SessionNote[], archived: MemoryRecord[], indexLines: number }`
Записи из корня папки, заметки из `sessions/`, архив из `.archive/`. Битый frontmatter → `error`, запись в списке.

### `read_memory_file(path: string) -> { text: string }`
Полный текст файла (запись, заметка, `MEMORY.md`).

### `search_memory(query: string, slug?: string) -> MemoryHit[]`
Подстрока без учёта регистра по всем `.md` (кроме `.archive/`) одного или всех проектов; до 200 совпадений.

### `find_memory_duplicates(slug?: string) -> DuplicatePair[]`
Пары внутри проекта со `score ≥ 0.72` (R10), по убыванию `score`. Архив и записи с `error` не участвуют.

## Запись

Каждая команда: перечитать файл → копия в `memory-backups` → temp → rename → при необходимости правка
`MEMORY.md` (R9, тоже с копией). Ошибка на любом шаге — исходные файлы не тронуты.

### `save_memory_file(path: string, text: string) -> void`
Весь текст файла; `.archive/` — только чтение. Строку индекса не трогает: заголовок в `MEMORY.md` — текст
пользователя.

### `patch_memory_record(path: string, patch: RecordPatch) -> MemoryRecord`
Патч ключей frontmatter с сохранением порядка. `status: fact` или `importance: 3` → строка в `## Факты`; обратно —
строка возвращается в общий список.

### `archive_memory_record(path: string) -> { archivedPath: string }`
В `.archive/` (коллизия → `-2`…), строка индекса убрана. Для «Отменить».

### `restore_memory_record(archivedPath: string) -> MemoryRecord`
Назад в корень, строка индекса `- [name](file.md) — description` добавлена в конец списка записей.

### `move_memory_record(path: string, targetSlug: string) -> MemoryRecord`
В существующую папку памяти другого проекта (нет папки → ошибка `unknown memory project`); у источника строка убрана, у цели добавлена. `files:` не переписываются.

### `merge_memory_records(canonical: string, absorbed: string[]) -> MemoryRecord`
Слияние по R10 в пределах одного проекта; поглощённые → `.archive/` с `consolidated_into`, их строки убраны.

## Событие

### `memory://changed` (payload: `{ slug: string }[]`)
Watcher на `~/.claude/projects` (рекурсивно), фильтр — путь содержит компонент `memory`, дебаунс 500 мс, свои
`.echo-studio.tmp` игнорируются. Фронтенд инвалидирует `['memory', slug]` и `['memory', 'projects']`.
