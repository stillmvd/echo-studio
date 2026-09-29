# Quickstart: проверка памяти

Контракты — [contracts/hooks.md](contracts/hooks.md), [contracts/ipc.md](contracts/ipc.md).

## 0. Установка плагина

```text
/plugin marketplace add C:\Users\stillmvd\Projects\Windows Apps\Echo Studio
/plugin install echo-memory@echo-studio
```

Перезапустить Claude Code. `/hooks` показывает 5 хуков echo-memory.

## 1. Ранняя проверка Stop (до US1)

Каркасный `stop.mjs` пишет вход в `%TEMP%/claude-memory/probe.log` и блокирует один раз.

1. Новая сессия в любом проекте, запрос с правкой файла.
2. Ожидание: Claude получает reason и продолжает ход; в `probe.log` два входа — `stop_hook_active: false`, затем
   `true`; третьего блока нет.
3. Ввести `/remember` → в JSONL сессии найти строку команды, сверить с шаблоном R2.
4. Сверить `memory_dir` из R1 с реальной папкой `~/.claude/projects/<slug>/memory` этого проекта.
5. Проверить, видит ли Claude блок сессий `MEMORY.md`, изменённый хуком SessionStart в той же сессии (R5).
6. Заглушка `pre-read.mjs` возвращает `additionalContext` с меткой → после Read Claude называет метку (R7).

Результаты дописать в research.md (R1–R5). Не подтвердилось — поправить план до US1.

## 2. US1 — итог сессии

| Сценарий | Ожидание |
|----------|----------|
| Сессия с правкой файла | после ответа — `memory/sessions/YYYY-MM-DD_<s8>.md`, `session_id`, 5 разделов; один блок |
| Ещё 15 сообщений | та же заметка перезаписана, `updated` новее |
| 3 вопроса без правок | заметки нет, `probe`/errors пусты |
| Заметка с `sk-ant-xxx`, `ghp_…`, PEM, `<private>…</private>` | в файле `[REDACTED]` |
| Сломать `stop.mjs` (throw) | сессия завершается, строка в `errors.log` |
| `/remember` в короткой сессии | заметка появилась |

Unit: `pnpm test` — `plugin/lib/*.test.mjs` (значимость, блок, scrub-набор SC-005).

## 3. US2 — старт

1. Положить 10 заметок в `sessions/`, запустить сессию.
2. `MEMORY.md`: блок `<!-- memory:sessions -->` с 3 новейшими, текст вне блока побайтно тот же.
3. Спросить «что мы делали в прошлый раз» — Claude читает заметку.
4. `MEMORY.md` на 250 строк → в контексте предупреждение; вывод хука ≤ 8 000 символов (замерить через лог).
5. Время хука: `Measure-Command { Get-Content input.json | node plugin/hooks/session-start.mjs }` < 200 мс.

## 4. US3–US4 — Echo Studio

```bash
pnpm tauri dev
```

| Действие | Ожидание |
|----------|----------|
| Открыть Memory | проекты со счётчиками; записи и сессии отдельно; совпадает с файлами |
| Поиск «wikilink» | совпадения во всех проектах, по подстроке, кириллица работает |
| Правка текста | файл изменён, копия в `%APPDATA%/…/memory-backups/`, индекс согласован |
| Удалить → «Отменить» | файл в `.archive/` и обратно, строка индекса убрана и вернулась |
| Перенести в другой проект | файл и строка индекса у цели, у источника нет |
| Правка файла снаружи | список обновился ≤ 2 с |
| Две похожие записи → «Дубли» → слить | ≤ 3 клика; одна запись с «Merged from», вторая в `.archive/` с `consolidated_into` |
| Закрепить / «Факт» | строка в `## Факты` |

Гейты: `pnpm biome check .` → `pnpm typecheck` → `pnpm test` → `pnpm build`; `cargo clippy … -D warnings`,
`cargo test --manifest-path src-tauri/Cargo.toml`.

## 5. P3

- **US5**: сохранить похожее знание во второй сессии → у записи `seen: 2`, `status: fact`, строка в `## Факты`.
- **US6**: запись с `files: [src/App.tsx]` → Read этого файла подмешивает её один раз; после правки файла — нет.
- **US7**: значимая сессия → закрыть окно без итога → черновик `capture: extractive`; следующий старт предлагает дописать.
- **US8**: `/reflect` → список предложений, CLAUDE.md не изменён, `.reflect.log` пополнен.
