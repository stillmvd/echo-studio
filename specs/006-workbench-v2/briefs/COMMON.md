# Общие правила исполнителей фичи 006 (workbench v2)

Ты — фоновая сессия-исполнитель. Координатор — сессия `workbench-v2-coordinator-2` (пиши ей через `SendMessage`,
имя из `ListAgents`). Пользователя не спрашивай (`AskUserQuestion` недоступен) — решения по умолчанию из спеки и этого
брифа; если развилка реальная — напиши координатору и продолжай с самым безопасным вариантом.

## Старт

1. `EnterWorktree` с `path` = `C:\Users\stillmvd\Projects\Windows Apps\Echo Studio\.claude\worktrees\v2-<твоё имя>`
   (ветка `v2-<имя>` от `workbench-v2` уже создана). Все команды — из этого worktree. В основной папке Echo Studio
   ничего не править.
2. Прочитать: `CLAUDE.md` проекта, `specs/006-workbench-v2/spec.md` (раздел «Решения»), `plan.md` (таблица владения
   файлами), `research.md`, `data-model.md`, `contracts/ipc.md`, `tasks.md` (свои задачи по пометке исполнителя),
   свой бриф `specs/006-workbench-v2/briefs/<имя>.md`.
3. Память проекта: `C:\Users\stillmvd\.claude\projects\C--Users-stillmvd-Projects\memory\desktop-app-peeves.md`
   (что бесит пользователя в UI) и `ui-newbie-and-better-ui.md` — применять.

## Нагрузка на ПК (жёстко, после перегрузки 21.10)

- Rust собирает одновременно одна сессия (R1 или координатор): всегда `CARGO_BUILD_JOBS=4` и общий
  `CARGO_TARGET_DIR=C:\Users\stillmvd\.cache\echo-v2-target` (переменные в каждой cargo-команде).
- Фронт-исполнители cargo, clippy и `pnpm tauri dev` не запускают — только `pnpm biome check .`, `pnpm typecheck`,
  `pnpm test`, `pnpm build`. Rust-проверки их веток делает координатор.
- Живой `tauri dev` — один экземпляр за раз, только у координатора (или назначенного проверяющего), после проверки
  закрыть. Живые проверки quickstart — координатор после переноса; исполнитель пишет в отчёте «не проверено вживую: …».
- После правок Rust — `~/.claude/tools/cleanup/kill-rust-analyzer.ps1`; rust-analyzer не держать.
- 21.10 ПК завис на 30 мин. Глобальный хук `~/.claude/hooks/bg-load-guard.js` ставит фоновым сессиям BelowNormal и
  отказывает: тяжёлым командам при свободной RAM < 6 ГБ, второй сборке Rust при живом rustc, `claude --bg` без
  `--strict-mcp-config` и при ≥ 7 фоновых сессиях, открытию окон (wt, explorer, браузер). На отказ — ждать
  (`ScheduleWakeup` 120–300 с), не обходить. Ничего не открывать на экране пользователя; никаких пробных окон
  терминала, `grep` по процессам в цикле, `tauri dev`. Живые проверки — только координатор.

## Правила

- Правь только файлы из своей колонки таблицы владения в `plan.md`. Нужен чужой файл — напиши координатору, не
  правь.
- Код без комментариев (кроме TODO). Biome, strict TS, `noUncheckedIndexedAccess`. Rust: `cargo fmt`, clippy
  `-D warnings`.
- Коммиты: `feat(workbench): …` / `fix(workbench): …`, по историям, маленькие. **Никаких упоминаний Claude /
  Anthropic / AI в сообщении и trailer'ах** (`Co-Authored-By` не добавлять). Без пуша. `pnpm release` не запускать.
- Чужие процессы не трогать: сессию пользователя в `Projects` (`projects-12`), `am-2-0-7e`, `echo-studio-e6`, фоновые
  сессии Smart Control `56b05866` и `3ab7f61b`; dev-сервер Smart Control на :5057; Echo пользователя (vite :1420 и
  установленный `echo-studio.exe`). Не `claude stop`/`rm`, не «Стоп», не attach. Проекты AM 2.0 и Smart Control —
  не открывать для правок, dev и сессии там не запускать.
- Пробное убирать сразу после шага: `claude stop` + `claude rm` своих сессий, dev — «Стоп». Чужие и старые сессии
  из «Продолжить» не возобновлять (пользователя путают пробные сессии и dev, которые он не запускал).
- Живые проверки — только на Echo Studio, Tolk, Booked, Breeze. Пробные сессии — `claude --bg` в своём worktree
  Echo Studio; после проверки `claude stop <id>` + `claude rm <id>` только своих.
- Свой dev Echo из worktree: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=<CDP>" pnpm tauri dev
  --config <json>` где json = `{"build":{"devUrl":"http://localhost:<VITE>","beforeDevCommand":"pnpm dev --port
  <VITE>"}}` — порты из твоего брифа. Перед финалом — остановить свой dev и MCP-браузер.
- Проверки после задач: `pnpm biome check .` → `pnpm typecheck` → `pnpm test` → `pnpm build`; при правках Rust —
  `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` и `cargo test --manifest-path
  src-tauri/Cargo.toml`. Падает — чинить, не рапортовать «готово».
- Контракт IPC (`src/lib/ipc.ts`, `src/lib/types.ts`) в пачке 1 правит только R1. Когда координатор сообщит, что
  контракт в `workbench-v2`, сделай `git merge workbench-v2` в своей ветке.
- Отклонения от формулировок задач — записывай в `specs/006-workbench-v2/tasks.md`, раздел «Отклонения от
  формулировок», и отмечай задачи `[X]`.

## Финал

1. Все свои задачи `[X]`, проверки зелёные, всё закоммичено.
2. `SendMessage` координатору: первая строка — «<имя>: пачка готова, ветка v2-<имя> на <хэш>», далее список
   коммитов, что проверено вживую, что нет, отклонения.
3. Остановись (не завершай сессию сам). Координатор может прислать правки по ревью — тогда исправь, закоммить,
   сообщи снова.

Контекст заканчивается (≥ 85% по statusline) → `.planning/HANDOFF-<имя>.md` в worktree (что сделано, что осталось,
хэши), коммит, сообщение координатору «handoff», стоп.
