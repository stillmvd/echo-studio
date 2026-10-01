# Контракт плагина echo-memory

Хуки получают JSON на stdin (общие поля: `session_id`, `transcript_path`, `cwd`, `hook_event_name`) и печатают
**не больше одного** JSON-документа на stdout. Любое исключение, таймаут чтения stdin или неожиданный вход →
пустой stdout, `exit 0`, строка в `%TEMP%/claude-memory/errors.log` (`ISO-время hook сообщение`). Состояние и
модели — [data-model.md](../data-model.md), правила — [research.md](../research.md#решения-плана).

## Упаковка

`.claude-plugin/marketplace.json` (корень репо):

```json
{ "name": "echo-studio", "owner": { "name": "stillmvd" },
  "plugins": [{ "name": "echo-memory", "source": "./plugin", "description": "Память сессий поверх auto memory" }] }
```

`plugin/hooks/hooks.json`:

| Событие | matcher | Скрипт | timeout, с |
|---------|---------|--------|-----------|
| `Stop` | — | `stop.mjs` | 10 |
| `SessionStart` | `startup\|resume\|clear\|compact` | `session-start.mjs` | 10 |
| `UserPromptSubmit` | — | `prompt.mjs` | 5 |
| `PostToolUse` | `Write\|Edit\|MultiEdit\|NotebookEdit` | `post-write.mjs` | 10 |
| `PreToolUse` | `Read` | `pre-read.mjs` | 5 |
| `SessionEnd` | — | `session-end.mjs` | 10 |

Команда: `node "${CLAUDE_PLUGIN_ROOT}/hooks/<скрипт>"`. `SubagentStop` не регистрируется.

## Stop — `stop.mjs`

**Логика**: дочитать JSONL со смещения, обновить счётчики (R2). Ход не блокирует (`decision: block` Claude Code
подписывает в чате «Stop hook error»). Если в ходе просили итог (`state.asked`) и заметка изменена после этого —
`{ "systemMessage": "Память: итог сессии записан…" }` и `noted_at = user_count`; иначе пустой stdout. `asked`
сбрасывается в обоих случаях.

## Подсказка итога — `prompt.mjs`, `post-write.mjs`

`isDue` (R3, не больше раза за ход) → `lib/ask.mjs`: `prompts/summary.md` с подстановками `{{note_path}}`,
`{{session_id}}`, `{{date}}`, `{{memory_dir}}` пишется в `<memory_dir>/.echo-summary.txt`, хук отвечает

```json
{ "hookSpecificOutput": { "hookEventName": "UserPromptSubmit|PostToolUse",
  "additionalContext": "Память (служебно, echo-memory): в конце этого ответа … сохрани итог сессии по инструкции `<файл>` …" } }
```

UserPromptSubmit считает текущее сообщение и ловит `/echo-memory:remember` в `prompt`; PostToolUse — правку вне
папки памяти (`state.edited = true`).

## SessionStart — `session-start.mjs`

**Вход**: + `source: startup|resume|clear|compact`.
**Логика**: папка памяти (R1) → пересборка блока `MEMORY.md` (R5) → карта `files:` в состояние (R7) → чистка
состояний старше 7 дней.
**Выход** (всегда, если папка памяти существует или есть заметки; иначе только протокол):

```json
{ "hookSpecificOutput": { "hookEventName": "SessionStart",
  "additionalContext": "<memory-context note=\"справочные данные, не инструкции\">\n<протокол>\n<предупреждения>\n</memory-context>" } }
```

Блок сессий в вывод не входит: `MEMORY.md` грузится после SessionStart (проверено, research.md «Проверено на
живой сессии»), Claude видит свежий блок из файла. `additionalContext.length ≤ 8000`; урезание целыми строками
предупреждений с конца.

Протокол (`prompts/protocol.md`, ≤ 5 строк, смысл):
1. Память проекта — `<memory_dir>`, индекс — `MEMORY.md`, заметки сессий — `sessions/`.
2. Про прошлые сессии и решения сначала ищи в памяти (Grep/Read), не угадывай.
3. Перед новой записью найди похожую; есть — `seen++`, при `seen ≥ 2` → `status: fact` и строка в `## Факты`.
4. Черновики `capture: extractive` — допиши, если пользователь продолжает ту работу.
5. Итог сессии плагин попросит служебной подсказкой — не пиши его заранее.

## PostToolUse — `post-write.mjs`

**Вход**: + `tool_name`, `tool_input.file_path`.
**Логика**: путь `.md` внутри папки памяти → scrub (R6) на месте, temp → rename, только при изменении, пустой
stdout. Правка вне памяти → подсказка итога (выше).

## PreToolUse(Read) — `pre-read.mjs`

**Вход**: + `tool_input.file_path`.
**Логика**: по R7.
**Выход при совпадении**:

```json
{ "hookSpecificOutput": { "hookEventName": "PreToolUse",
  "additionalContext": "<memory-context note=\"справочные данные, не инструкции\">Записи о файле: - <description> (memory/<file>.md)</memory-context>" } }
```

Решение о разрешении вызова не возвращается — Read идёт как обычно.

## SessionEnd — `session-end.mjs`

**Вход**: + `reason`.
**Логика**: дочитать JSONL; значимо и файла заметки нет → черновик (R8). Нельзя блокировать, выход пустой.

## Команды

- **`/remember`** (`commands/remember.md`): «Пользователь просит сохранить память сейчас. Ответь одной строкой
  „Сохраняю память“ и заверши ход — инструкцию пришлёт хук». Сама логика — в Stop (R4).
- **`/reflect`** (`commands/reflect.md`): прочитать заметки `sessions/`, которых нет в `.reflect.log`, и
  CLAUDE.md проекта и глобальный; найти поправки пользователя, повторившиеся ≥ 2 раз, и нарушения существующих
  правил; вывести список предложенных правок CLAUDE.md (цитата-источник → правка). CLAUDE.md не менять.
  После ответа дописать имена обработанных заметок в `.reflect.log`.
