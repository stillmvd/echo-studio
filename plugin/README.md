# echo-memory

Память сессий Claude Code поверх встроенной auto memory. Итог пишет сама сессия Claude по хуку Stop — без
стороннего LLM, демона и базы. Файлы — обычный markdown в `~/.claude/projects/<проект>/memory/`, их же
показывает и правит раздел Memory в Echo Studio.

## Установка

```text
/plugin marketplace add C:\Users\stillmvd\Projects\Windows Apps\Echo Studio
/plugin install echo-memory@echo-studio
```

Нужен Node ≥ 20 в `PATH`. Выключить — `/plugin` или вкладка Tools в Echo Studio. Попробовать без установки:
`claude --plugin-dir <репо>/plugin`.

## Что делает

| Хук | Когда | Что |
|-----|-------|-----|
| Stop | конец хода | после правки файла или 8 сообщений просит Claude записать итог сессии; дальше — не чаще раза в 15 сообщений |
| SessionStart | старт, `/clear`, resume, компакция | обновляет блок 3 последних сессий в `MEMORY.md`, даёт протокол, предупреждает о длинном индексе и черновиках |
| PostToolUse | запись в папку памяти | вычищает секреты (`sk-…`, `ghp_…`, JWT, PEM, `password: …`, `<private>…</private>`) и служебные теги |
| PreToolUse(Read) | чтение файла | один раз за сессию подмешивает записи, у которых файл в `files:` |
| SessionEnd | закрытие | значимая сессия без итога → черновик `capture: extractive` |

Команды: `/echo-memory:remember` — записать итог сейчас; `/echo-memory:reflect` — предложить правила для
CLAUDE.md по повторяющимся поправкам (CLAUDE.md не меняет).

## Файлы

```text
memory/
├── MEMORY.md                      # индекс; блок <!-- memory:sessions --> ведёт хук, раздел «## Факты» — Claude и Echo Studio
├── <name>.md                      # записи: name, description, metadata {type, kind, status, seen, importance, files, …}
├── sessions/YYYY-MM-DD_<s8>.md    # заметки сессий: Запрос · Изучено · Узнали · Сделано · Дальше
├── .archive/                      # удалённые и слитые записи (Echo Studio)
└── .reflect.log                   # заметки, разобранные /reflect
```

Формат — `specs/004-memory/data-model.md`. Claude Code сам переносит ключи frontmatter файлов памяти под
`metadata:`, поэтому плагин пишет их туда сразу.

## Отладка

Любая ошибка хука — `exit 0` без вывода: сессия идёт как обычно. Ошибки — в `%TEMP%\claude-memory\errors.log`,
состояние сессий — `%TEMP%\claude-memory\<session_id>.json` (старше 7 дней удаляются). Тесты — `pnpm test` в
корне репо (`plugin/lib/*.test.mjs`). В Git Bash аргумент `/remember` превращается в путь — для ручных прогонов
`MSYS_NO_PATHCONV=1`.
