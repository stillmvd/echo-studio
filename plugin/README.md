# echo-memory

Память сессий Claude Code поверх встроенной auto memory. Итог пишет сама сессия Claude по служебной подсказке
плагина — без стороннего LLM, демона и базы. Файлы — обычный markdown в `~/.claude/projects/<проект>/memory/`, их же
показывает и правит раздел Memory в Echo Studio.

## Установка

```text
/plugin marketplace add C:\Users\stillmvd\Projects\Windows Apps\Echo Studio
/plugin install echo-memory@echo-studio
```

Нужен Node ≥ 20 в `PATH`. Выключить — `/plugin` или вкладка Tools в Echo Studio. Попробовать без установки:
`claude --plugin-dir <репо>/plugin`.

Обновления: плагин из локального marketplace не копируется — Claude Code читает `plugin/` прямо из репо. Правки
видны в новой сессии или после `/reload-plugins`, номер версии поднимать не нужно. Поэтому в репо Echo Studio
не переключаться на ветку без `plugin/` и не держать там незаконченные правки плагина.

В чате пользователь видит одну строку статуса (`systemMessage`, в контекст Claude не попадает): на старте —
«Память: 53 записи · 2 закреплены · прошлая сессия 29 сен «…» → дальше: …» и предупреждения; после итога —
«Память: итог сессии записан · +2 записи (decision, gotcha)». Итог Claude пишет в том же ходе, по подсказке
из хука (`additionalContext`): ход не прерывается блоком Stop, поэтому в чате нет «Stop hook error».

## Что делает

| Хук | Когда | Что |
|-----|-------|-----|
| UserPromptSubmit | сообщение пользователя | с 8-го сообщения и на `/echo-memory:remember` добавляет к нему невидимую подсказку «в конце ответа сохрани итог по инструкции в `.echo-summary.txt`»; дальше — не чаще раза в 15 сообщений |
| Stop | конец хода | если в этом ходе просили итог и заметка записана — строка статуса; если был handoff — кладёт промпт новой сессии в буфер обмена; ход не останавливает |
| SessionStart | старт, `/clear`, resume, компакция | обновляет блок 3 последних сессий в `MEMORY.md`, даёт протокол, предупреждает о длинном индексе и черновиках |
| PostToolUse | любой инструмент | handoff по заполнению контекста (см. ниже); при правке файла: в папке памяти вычищает секреты (`sk-…`, `ghp_…`, JWT, PEM, `password: …`, `<private>…</private>`) и служебные теги; правка вне памяти — та же подсказка про итог, что у UserPromptSubmit (первая правка, затем раз в 15 сообщений) |
| PreToolUse(Read) | чтение файла | один раз за сессию подмешивает записи, у которых файл в `files:` |
| SessionEnd | закрытие | значимая сессия без итога → черновик `capture: extractive` |

Команды: `/echo-memory:remember` — записать итог сейчас; `/echo-memory:reflect` — предложить правила для
CLAUDE.md по повторяющимся поправкам (CLAUDE.md не меняет); `/echo-memory:tidy` — ревизия памяти проекта:
таблица «удалить / обновить / слить / оставить» с доказательствами, правки только после «да», удалённое — в
`.archive/`.

## Handoff по заполнению контекста

Когда контекст сессии доходит до 50% (дальше — 65%, 80%, 95%), PostToolUse или UserPromptSubmit подмешивают
подсказку с инструкцией `.echo-handoff.txt`: доделать текущий шаг, переписать `HANDOFF.md` проекта (существующий
в корне или `.planning/`, иначе новый в корне) как снимок «где мы сейчас», записать итог сессии, вывести промпт
для новой сессии в обратных кавычках и сохранить его в `%TEMP%/claude-memory/<session>-next-prompt.txt`. Stop
кладёт промпт в буфер обмена (Windows — `Set-Clipboard`, macOS — `pbcopy`) и пишет «… — /new и Ctrl+V».
В субагентах не срабатывает.

Процент берётся из файла `%TEMP%/claude-memory/ctx-<session>.json` (`{"used_pct":N,"size":N}`): его пишет
statusLine — Claude Code отдаёт заполнение контекста только туда. Без такой строки в statusLine handoff молчит.

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
