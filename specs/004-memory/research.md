# Research: память для Claude Code

**Date**: 2026-09-29

Разобраны изнутри (клоны `--depth 1`, код и промпты): claude-mem, EchoVault, MemPalace, Basic Memory,
claude-diary, claude_memory, claude-mem-lite, документация Claude Code по auto memory и хукам.

## Обзор кандидатов

| Инструмент | ⭐ | Захват | Хранение | Итог |
|---|---|---|---|---|
| Auto memory (встроена) | — | Claude пишет сам по ходу | md + `MEMORY.md`-индекс, первые 200 строк / 25 КБ грузятся на старте | основа, поверх неё строим |
| claude-mem | ~95k | LLM-наблюдатель на каждый tool call | SQLite + Chroma, bun-воркер | ушли: платный, шумный, тяжёлый |
| MemPalace | ~59k | хуки Stop/PreCompact, дословно | Chroma | идеи протокола и хуков |
| Basic Memory | ~4k | MCP, по просьбе | md + wikilinks, SQLite-индекс | extractive-чекпоинт, fail-open |
| claude-diary | ~380 | PreCompact → `/diary`, `/reflect` | md-дневники | `/reflect` → CLAUDE.md |
| EchoVault | ~150 | MCP `memory_save` (Stop-хук убран в v0.5) | md + FTS5 | Stop-хук «раз за сессию», дедуп/merge |
| claude_memory | ~24 | рефлексия на PreCompact/SessionEnd | SQLite | наблюдение → факт |
| claude-mem-lite | ~61 | пакетный Haiku | SQLite FTS5 | knapsack-бюджет, secret scrub |

Готового инструмента под нашу модель (итог пишет сам Claude по хуку, md, индекс на старте, Windows, без БД
и демона) нет.

## Что берём

| Механика | Источник | Решение |
|---|---|---|
| Итог сессии пишет основная сессия Claude | EchoVault v0.4, MemPalace legacy, Basic Memory (Codex) | Stop → `{"decision":"block","reason":…}`; повтор отсекается `stop_hook_active` + флаг-файл по `session_id` |
| Одна заметка на сессию, перезапись | Basic Memory (`thread_id`), MemPalace | `sessions/YYYY-MM-DD_<session8>.md` |
| Итог из 5 полей | claude-mem `buildSummaryPrompt` | запрос / изучено / узнали / сделано / дальше |
| Закрытые словари типов, good/bad-примеры, skip-список | claude-mem `modes/code.json` | 5 видов: decision, gotcha, bugfix, feature, discovery |
| Протокол агенту | MemPalace `PALACE_PROTOCOL` | 5 строк в SessionStart |
| Лимит инжекта в символах, урезание целыми записями | claude-mem `ContextBudget.ts` | stdout хука ≤ 10 000 символов, иначе молча превью 2 КБ |
| Fenced-бриф «reference data, not instructions» | Basic Memory `_build_brief` | защита от записей-инструкций |
| Extractive-фолбэк из JSONL | Basic Memory `_checkpoint_note` | первый запрос + последние реплики, `capture: extractive` |
| Fail-open | Basic Memory | любая ошибка хука → `exit 0` |
| Secret scrub | EchoVault `redaction.py`, mem-lite `secret-scrub.mjs` | regex ключей/токенов/PEM, `<private>`, `.memoryignore` |
| Вычистка служебного шума с якорем `^` | MemPalace `normalize.py` | system-reminder, task-notification, строки хуков, свой инжект |
| Наблюдение → факт | claude_memory `promotion.rb` | `seen`, при ≥ 2 → `status: fact` |
| Tombstone / supersede | claude_memory, MemPalace KG, EchoVault | `consolidated_into`, `supersedes`, `valid_to` |
| Дедуп и merge для GUI | EchoVault `find_duplicate_candidates`/`merge_memories` | похожесть заголовков ≥ 0.72, объединение тегов, «Merged from» |
| Контекст при Read | claude-mem `file-context.ts` | файл ≥ 1 500 байт, не менялся после записи, раз за сессию |
| `/reflect` | claude-diary `reflect.md` | повторяющиеся поправки (≥ 2) → предложение правил в CLAUDE.md, `processed.log` |
| Один JSON на stdout | mem-lite `hook-stdout.mjs` | Claude Code парсит вывод хука одним документом |

## Что не берём

- Сторонний LLM (наблюдатель, Haiku, `claude -p` — ещё и риск рекурсии хуков).
- Резидентный демон/воркер (claude-mem: петли рестартов, зависшие хуки).
- Векторные БД и эмбеддинги; SQLite как источник истины.
- Bash-хуки (на Windows требуют Git Bash) — только Node.
- Файл на сессию с секциями по категориям (EchoVault) — хрупко для правки и merge.

## Ограничения хуков Claude Code

- **Stop**: вход содержит `session_id`, `transcript_path`, `stop_hook_active`, `last_assistant_message`.
  `decision:block` + `reason` продолжает ход. Срабатывает на каждый конец хода, а не сессии; на Ctrl+C
  может не сработать.
- **SessionEnd**: блокировать и влиять на Claude нельзя; бюджет ~1,5 с (поле `timeout` до 60 с).
  Только детерминированная работа.
- **SessionStart** (`startup|resume|clear|compact`): `hookSpecificOutput.additionalContext`, лимит 10 000 символов.
- **PreToolUse** (Read): `additionalContext` подмешивается к вызову.
- `stop_hook_active` проверить на живом хуке — одна из выборок доки его не подтвердила.

## Решения плана

Phase 0 `/speckit-plan`, 2026-09-29. Пункты, отмеченные «проверить на живой сессии», подтверждаются первым шагом
реализации (quickstart §1), результат дописывается сюда.

### R1. Папка памяти проекта

- **Decision**: хук берёт `cwd` из входа, ищет вверх `.git` (для worktree — файл `.git` → `gitdir` → `commondir` →
  корень основного репо), иначе сам `cwd`; slug — замена каждого символа вне `[A-Za-z0-9]` на `-`; папка —
  `~/.claude/projects/<slug>/memory/`. Echo Studio ничего не вычисляет: сканирует `~/.claude/projects/*/memory`,
  имя проекта берёт из cwd сессий этой папки (сканер Conversations), иначе из slug.
- **Rationale**: так Claude Code строит путь auto memory (общая папка для worktree и подпапок репо). Этот проект:
  `C--Users-stillmvd-Projects-Windows-Apps-Echo-Studio`. Проверить на живой сессии.
- **Alternatives**: папка транскрипта (`dirname(transcript_path)`) — расходится при запуске из подпапки;
  `autoMemoryDirectory` из настроек — не используется, YAGNI.

### R2. Значимость сессии без лишних хуков

- **Decision**: Stop читает транскрипт JSONL инкрементально с байтового смещения из состояния сессии. Считает
  сообщения пользователя (`type: user`, текст, не `tool_result`, не `isMeta`) и `tool_use` с именами
  `Edit|Write|MultiEdit|NotebookEdit`; ловит `/remember` (`<command-name>/remember</command-name>`). Битая строка
  пропускается.
- **Rationale**: один процесс на конец хода, < 200 мс даже на длинной сессии; resume продолжает со смещения.
- **Alternatives**: счётчики в UserPromptSubmit + PostToolUse — лишний запуск Node на каждый промпт и правку;
  полное чтение JSONL на каждом Stop — медленно на сессиях в десятки МБ.

### R3. Когда блокировать и защита от цикла

- **Decision**: блок, если `stop_hook_active` ложно и (`/remember` в новых строках или (значимо и
  `user_count − noted_at ≥ 15` или заметки ещё не было)). Значимо — была правка или `user_count ≥ 8`. После блока
  `noted_at = user_count`, поэтому повторный блок раньше чем через 15 сообщений невозможен, даже если Claude не
  записал заметку. Состояние — `%TEMP%/claude-memory/<session_id>.json` (temp → rename).
- **Rationale**: две независимые защиты: флаг Claude Code и собственный счётчик; работает, даже если
  `stop_hook_active` не придёт.
- **Alternatives**: проверять появление файла заметки — Claude может записать её в другое место, петля.

### R4. Инструкция итога и `/remember`

- **Decision**: `reason` Stop — текст `prompts/summary.md` (русский) с подстановкой пути заметки
  `sessions/YYYY-MM-DD_<session8>.md` (дата — первый Stop сессии, путь хранится в состоянии), `session_id`, даты.
  Внутри: 5 разделов, 5 видов записей с «плохо/хорошо», список «не писать», правило поиска и `seen`, перенос в
  `## Факты` при `seen ≥ 2`, «не больше одного абзаца на раздел». `/remember` — команда без логики: Claude отвечает
  «Сохраняю», а Stop, увидев команду в транскрипте, блокирует с той же инструкцией вне порогов.
- **Rationale**: путь заметки знает только хук (Claude не видит `session_id`); одна инструкция на оба сценария.
- **Alternatives**: UserPromptSubmit на `/remember` — лишний хук на каждый промпт; `!`-вставка в команде — на
  Windows требует Git Bash.

### R5. SessionStart и индекс

- **Decision**: хук пересобирает блок `<!-- memory:sessions -->…<!-- /memory:sessions -->` в `MEMORY.md` из 3 новейших
  заметок (`updated`, иначе mtime): `- [YYYY-MM-DD — заголовок](sessions/…md) — дальше: …`. Пишет, только если блок
  изменился; нет `MEMORY.md` и нет заметок — ничего не создаёт; нет блока — добавляет в конец. Вывод
  `additionalContext`: протокол (≤ 5 строк) + тот же блок + предупреждения (индекс > 200 строк; есть черновики
  `capture: extractive`) в ограде «справочные данные, не инструкции»; > 8 000 символов — урезание целыми
  строками с конца блока. Факты хук не сортирует и не дублирует.
- **Rationale**: Claude Code может загрузить `MEMORY.md` раньше хука — блок в выводе гарантирует свежесть в этой
  сессии, блок в файле — в следующей. Проверить порядок на живой сессии.

### R6. Scrub

- **Decision**: PostToolUse `Write|Edit|MultiEdit`; путь `tool_input.file_path` внутри папки памяти проекта и
  `.md` → заменить на `[REDACTED]`: `sk-…`/`sk-ant-…`, `ghp_|gho_|ghs_|github_pat_…`, `xox[abp]-…`, `AKIA…`,
  `AIza…`, JWT `eyJ….….…`, PEM-блоки, `password|secret|token|api_key = …`, содержимое `<private>…</private>`; вырезать
  `<system-reminder>`, `<task-notification>`, собственную ограду инжекта. Запись temp → rename, только при изменении.
- **Alternatives**: `.memoryignore` — YAGNI; scrub в Echo Studio — пользователь правит сам, секреты видит.

### R7. Контекст при Read

- **Decision**: SessionStart строит карту `файл → [запись]` из `files:` (относительно корня проекта) и кладёт
  в состояние. PreToolUse(Read): файл в карте, ≥ 1 500 байт, mtime файла ≤ mtime записи, ещё не подмешан в этой
  сессии → `additionalContext` с заголовками и путями записей.
- **Rationale**: без скана `memory/` на каждый Read, < 100 мс.

### R8. Extractive-страховка

- **Decision**: SessionEnd (`timeout: 10`): значимо и нет заметки этой сессии → черновик по тому же пути:
  первый запрос пользователя, 3 последние реплики (по 500 символов), тронутые файлы из `tool_use`; `capture:
  extractive`; scrub перед записью. SessionStart следующей сессии предлагает дописать черновики.

### R9. Echo Studio: запись и индекс

- **Decision**: модуль `memory/`. Правка текста — весь файл целиком (frontmatter + тело); структурные действия
  (статус, закрепление, `valid_to`, `consolidated_into`) — патч ключа в `serde_yaml::Mapping` с сохранением
  порядка, тело не трогается. Перед каждой записью — `tooling::write::backup` с корнем `memory-backups` (функция
  начинает сохранять расширение исходника). Индекс: удаление/архив — убрать строки со ссылкой на файл; перенос —
  убрать у источника, добавить у цели; восстановление — строка `- [name](file.md) — description`; статус `fact` или
  `importance: 3` — строка переезжает в `## Факты` (секция создаётся после первого заголовка или в начале).
  Коллизия имени при переносе/восстановлении — суффикс `-2`, `-3`….
- **Alternatives**: переписывать весь frontmatter из модели — теряет неизвестные ключи.

### R10. Дубли и слияние

- **Decision**: пары внутри проекта; похожесть — коэффициент Dice по биграммам нормализованного текста
  (нижний регистр, без пунктуации, `-` → пробел). Если описания есть у обеих — `min(Dice(description),
  0.5 + доля общих слов ≥ 3 букв)`, иначе Dice(`name`); порог 0.72 (было `max(name, description)` — похожие
  имена вроде `old-deploy-flow`/`new-deploy-flow` давали 0.79). «Не дубли» — ключ `slug/файл|файл` в
  `%APPDATA%/<app id>/memory-dupes-ignored.json`.
  Каноническая по умолчанию: выше `importance`, затем `seen`, затем новее; пользователь может поменять. Итог:
  тело каноничной + `\n\n---\nMerged from <name> (<дата>):\n\n<тело>`, `tags` и `files` — объединение, `seen` —
  сумма, `importance` — максимум; поглощённая получает `consolidated_into: <файл>` и уходит в `.archive/`.
- **Alternatives**: SequenceMatcher (EchoVault) — нет в stdlib Rust, Dice даёт близкий результат в 20 строк.

### R11. Упаковка плагина

- **Decision**: `.claude-plugin/marketplace.json` в корне репо (`name: echo-studio`, плагин `echo-memory`,
  `source: ./plugin`); установка `/plugin marketplace add <путь репо>` → `/plugin install echo-memory@echo-studio`.
  Команды хуков — `node "${CLAUDE_PLUGIN_ROOT}/hooks/<name>.mjs"`. Вкладка Tools уже показывает и выключает плагины.

## Проверено на живой сессии (T007, 2026-09-29)

`claude -p --plugin-dir plugin` 2.1.284, пробные хуки, репо в scratchpad.

- **R1**: Claude Code кладёт память в `~/.claude/projects/<slug корня git>/memory` — подтверждено для запуска из
  подпапки. Исключение: репо без коммитов → slug самого `cwd`. `paths.mjs` повторяет это правило (корень git
  засчитывается, только если `HEAD` указывает на существующий коммит/ref).
- **R2**: сообщение пользователя — `type: user`, `message.content` строкой. Причина блока Stop попадает в
  транскрипт как `type: user` с `isMeta: true` и текстом `Stop hook feedback:\n…` — отсекается фильтром `isMeta`.
  Команда плагина пишется строкой `<command-message>echo-memory:remember</command-message>\n<command-name>/echo-memory:remember</command-name>`,
  её тело — отдельным `isMeta`-сообщением. Шаблон: `<command-name>/(echo-memory:)?remember</command-name>`.
- **R3**: `stop_hook_active` приходит: `false` на первом Stop, `true` на Stop после блока. Второго блока нет.
  Во входе Stop есть и `last_assistant_message`.
- **R5**: `MEMORY.md` загружается **после** SessionStart — Claude увидел строку, дописанную хуком в той же
  сессии. Блок сессий в `additionalContext` дублировать не нужно: хук обновляет файл, вывод — только протокол и
  предупреждения. Урезание до 8 000 символов остаётся для протокола и предупреждений.
- **R7**: `additionalContext` из PreToolUse(Read) доходит до Claude (метка названа).
- Хуки плагина из `--plugin-dir` работают на Windows с командой `node "${CLAUDE_PLUGIN_ROOT}/hooks/…"`.
- В Git Bash аргумент `/remember` превращается в путь (`C:/Program Files/Git/remember`) — для ручных прогонов
  `MSYS_NO_PATHCONV=1`.

## US1 на живой сессии (T018, 2026-09-29)

- **Нормализация frontmatter**: Claude Code при записи любого файла в папку памяти (включая `sessions/`) приводит
  frontmatter к виду `name`, `description`, `metadata: {node_type: memory, type, …все прочие ключи…,
  originSessionId, modified}`. Поэтому формат плагина сразу кладёт свои ключи в `metadata`; заголовок заметки —
  `description`, `name` — `session-<s8>`. Читатели (плагин, Echo Studio) берут поле из `metadata`, иначе с верхнего
  уровня (`frontmatter.mjs#field`). Списки внутри `metadata` — блочным YAML (`files:\n    - a`).
- Сессия с правкой → один блок → заметка с 5 разделами, запись `kind: decision` с `files`, строка в `MEMORY.md`.
  Claude сам создал пустые маркеры блока сессий.
- Scrub на прямом вызове `post-write.mjs`: `password: …` и `sk-ant-…` → `[REDACTED]`. Битый stdin → `exit 0`,
  стек в `errors.log`.
- Время Stop: транскрипт 12,5 МБ — 224 мс первый полный проход, 188 мс инкрементально; из них 130–165 мс —
  запуск Node на этой машине, работа хука ≈ 40 мс. SC-003 (< 200 мс сверх обычного) — выполнено для
  инкрементального случая; полный первый проход бывает только раз за сессию.
- Перезапись через 15 сообщений проверена unit-тестами (`decide.test.mjs`), вживую не гонялась — дорого в `-p`.

## US2 на живой сессии (T023, 2026-09-29)

- Блок `memory:sessions` пересобран из заметок; текст вне блока не тронут. «Дальше: —» в строку не попадает.
- Вопрос «что мы делали в прошлый раз и что решили про деление» → Claude ответил по заметке сессии и записи
  `decision`, с номером сессии; короткая сессия без правок новой заметки не создала (SC-002).
- `MEMORY.md` на 255 строк → предупреждение в выводе. Вывод без предупреждений — 735 символов.
- Время SessionStart: 200–236 мс, из них ≈ 150 мс — запуск Node.

## US6 (T047, 2026-09-29)

Прямой вызов хуков на пробном репо: `calc.js` > 1 500 байт, запись с `files: [calc.js]` свежее файла → первый
Read подмешивает описание записи, второй — нет; после правки `calc.js` — нет. Работа хука сверх запуска Node
≈ 50–70 мс (замер под нагрузкой: голый `node -e 0` — 230–250 мс).

## US5, US7, US8 (2026-09-29)

- **US5** вживую: вторая сессия с тем же правилом → Claude нашёл запись, `seen: 2`, `status: fact`, строка
  перенесена в `## Факты` в начале `MEMORY.md`, новой записи не создал. Правило уже было в `summary.md` с US1,
  T043 свёлся к проверке.
- **US7** прямым вызовом `session-end.mjs` на настоящем транскрипте: черновик `capture: extractive` с первым
  запросом, 3 репликами, тронутыми файлами (записи в память отфильтрованы), пароль из запроса → `[REDACTED]`;
  следующий SessionStart пишет «Черновик без итога: … — допиши». Закрытие окна вживую не гонялось — SessionEnd
  в `-p` срабатывает с `reason: other`, тот же путь кода.
- **US8** вживую: `/echo-memory:reflect` разобрал 2 заметки, повторов поправок нет — ответил одной фразой,
  CLAUDE.md не создал и не менял, `.reflect.log` пополнен.

## Закрепление (T057, 2026-09-29)

- `claude -p --plugin-dir plugin` 2.1.284 в пробном репо с коммитом, запись `importance: 3`, кодовое слово только в
  теле; Read/Grep/Glob/Bash запрещены. SessionStart положил блок «Закреплённые записи (полный текст)» в
  `additionalContext`, Claude назвал слово без вызова инструментов.
- Echo Studio: в «## Факты» переносит только `status: fact`; закрепление строку индекса не двигает. Сумма
  `bodyChars` закреплённых > 6 500 — плашка в шапке проекта (запас под заголовки записей и протокол из 8 000).

## Quickstart §4, строки 1–6 (T036, 2026-09-29)

`pnpm tauri dev` (1425/9226), пробные проекты `pinrepo`/`pinrepo2`, действия через CDP.

- Счётчики проектов совпали с файлами (Breezee 58, Booked 22, …). Поиск «wikilink» и «кодовое слово» — по
  подстроке, без учёта регистра кириллицы, во всех проектах.
- Правка текста → файл изменён, копия в `memory-backups`. Перенос → файл и строка у цели, у источника нет.
  Файл, добавленный снаружи, появился в списке через ≈ 0,6 с.
- **Найдено и исправлено**: «Удалить → Отменить» возвращал строку индекса, собранную заново
  (`[name](file) — description`), а не исходную. Теперь `archive_memory_record` отдаёт удалённую строку,
  тост передаёт её в `restore_memory_record`; из вкладки «Архив» — прежняя сборка. Диалог переноса: «Отмена»
  вместо «Cancel».

## Дубли, слияние, «Устарела» (T037, T041–T042, 2026-09-29)

- Стенд 202: выбор «Где дубли C · Пара C · Сходство B · Слияние C · Каноничная C · Итог C · Устарела B»
  (`.planning/MEMORY-STANDS.md`). На машине пар ≥ 0.72 нет (максимум 0.65), проверка — на пробном проекте.
- Слияние: «Дубли» → «Слить…» → «Слить» — 2 клика (SC-006). Итог по R10: тело + `Merged from`, seen — сумма,
  tags/files — объединение, вторая в `.archive/` с `consolidated_into`, её строка из `MEMORY.md` убрана.
- «Устарела» ставит `valid_to` = сегодня (UTC); запись устаревшая при `valid_to <= сегодня` (было `<`, и пометка
  появлялась только назавтра). Замена — `supersedes: <имя>` у выбранной записи; «Вернуть» снимает оба.
  «Сделать фактом» → строка в `## Факты`.
- Ревью: ключи верхнего уровня frontmatter при патче переезжают в `metadata:` (иначе `valid_to` сверху не
  снимался); записи, уже заменяющие другую, не предлагаются в «чем заменена»; «Вернуть» снимает все замены.

## `/echo-memory:tidy` (T058, 2026-09-29)

- `claude -p --plugin-dir plugin "/echo-memory:tidy"` на пробном проекте: таблица с доказательствами
  («файла нет», «дубль, остаётся более новая»), спорное (`old-deploy-flow`) — вопрос пользователю; файлы не
  тронуты. Продолжение `claude -c -p "Да…"`: 2 в `.archive/`, 1 слита с `Merged from`, строки `MEMORY.md`
  согласованы, блок сессий не тронут.
- Для ручных прогонов: `--allowedTools` принимает список — промпт ставить после него через `-p`, иначе флаг его съедает.
- `consolidated_into` Echo Studio теперь пишет файлом (`g.md`), как в R10 и в `/tidy` (было имя записи).
