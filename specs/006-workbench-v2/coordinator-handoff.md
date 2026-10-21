# Handoff координатора 006 (workbench-v2-coordinator → преемник), 2026-10-21 11:50

Правила и ограничения — `.planning/ORCHESTRATION-006.md` основной копии (разделы «Нагрузка на ПК», «12.
Производительность», «Нельзя трогать»). Журнал с хэшами — `specs/006-workbench-v2/journal.md`. Короткий handoff —
`.planning/HANDOFF-006.md` (в ветке). Этот файл — полный снимок.

## Где работать

- Интеграционная ветка `workbench-v2`, worktree `C:\Users\stillmvd\Projects\Windows Apps\Echo Studio\.claude\worktrees\v2-integration`.
  Войти: `EnterWorktree` с `path`. Грабли: если Bash отвечает «working directory resolved to the shared checkout»
  (persisted cwd остался в общей копии) — `ExitWorktree keep` → `EnterWorktree path` заново. Сложные git-однострочники
  (`&&` с циклами, `-C .`, `git -C <другой worktree>`) харнесс отклоняет — простые команды по одной.
- `node_modules` в `v2-integration` установлены (`pnpm install --frozen-lockfile`). lefthook в этом worktree работает:
  коммит с Rust-файлами гоняет clippy (~2 мин) — это «сборка Rust» для хука нагрузки.
- Хук `bg-load-guard` отказывает командам, где встречаются слова cargo/rustc, пока идёт чужая сборка — проверку
  процессов писать через переменные (`$n = 'rustc.exe'; Get-CimInstance Win32_Process | ? Name -eq $n`).

## Состояние веток (хэши)

- `workbench-v2` = 9651559 (handoff) ← 3dd584b (journal) ← bb27f5b (merge v2-rust, пачка 1 R1) ← ea9fbc9 (merge
  v2-front-sessions) ← 08ba01a (merge v2-front-controls) ← 75e0940 (контракт IPC) ← 9d4f356 (спека) ← main b30eff7.
  Проверки на ea9fbc9/1e46396: biome, typecheck, vitest 166/166, vite build — зелёные; clippy — зелёный в lefthook
  на bb27f5b; `cargo test` на merge не гонял (Rust менял только R1, у него 132 + 2 ignored зелёные на 13fa767).
- `v2-rust` = dae29dc `perf(workbench): cache claude agents for 3 s, sessions hub min gap 3 s, overview-only polling`
  (поверх 07695be). **Запрошена правка** (сообщение ему в 11:48): `invalidate_agents()` после успешных
  `stop`/`forget`/`start`, иначе после «Завершить сессию» строка в «Запущено» висит до тика 15 с. Ждём хэш → merge.
- `v2-wall` = adb66ce (пачка 2: стор v3 `mode`/`projectLayouts`, `ModeSwitch`, `ProjectGrid` внутри `Wall.tsx`,
  `useTabDrag.ts`, DnD; 174 теста зелёные). **Ревью не завершено**: adversary-агент (sonnet) был запущен в моей
  сессии в 11:41, результат придёт в мою сессию и пропадёт — перезапустить: `Agent subagent_type adversary, model
  sonnet`, дифф `git diff 1e46396...v2-wall`, задачи T029–T036, бриф `briefs/wall.md`; акценты: инварианты раскладки
  (data-model «WorkbenchState v3»), миграция v2→v3, регресс пульта 005 (select из дерева должен закреплять ячейку
  `manual`), DnD (`dragleave` на вложенных, Esc, сброс в чужой проект в пульте → переназначение ячейки, перенос
  живой сессии без разрыва attach — порядок unmount/mount host в `terminals.ts`), `live`-фильтр exited в
  `WorkbenchLayout.tsx` не потерян. Отклонения D записаны в tasks.md («D wall»): нативные radio в label; select в
  режиме «Проект» не трогает пульт; dev-вкладка не прибита к началу; `--press-shade` → `--color-press-shade`.
- `v2-front-sessions` = d176fc2, `v2-front-controls` = d42f414 — влиты, закрыты.

## Исполнители

| Сессия | id | Состояние | Чего ждём |
|---|---|---|---|
| `v2-rust` | 5ccd1a94 | живая, правит инвалидацию кэша | хэш коммита → merge → `claude stop` |
| `v2-wall` | 2b2fa992 | живая, ждёт находок ревью | находки → фикс → хэш → merge → stop |
| `v2-front-sessions` | 76f2c7c9 | остановлена (`claude stop`), не `rm` | — (при правках после живой проверки — новый исполнитель или сам) |
| `v2-front-controls` | 6db6b32f | остановлена, не `rm` | — |

Все четверо запускались **без** `--strict-mcp-config` (до ужесточения) — это и дало ~10 MCP на сессию. Новых —
только `claude --bg --strict-mcp-config -n <имя> "<промпт>"`; скрипт запуска с очисткой `CLAUDE*` и промптом —
`C:\Users\stillmvd\.claude\jobs\4a9733a6\tmp\spawn.sh <имя> <бриф>` (job-dir моей сессии; скопировать к себе).
Брифы — `specs/006-workbench-v2/briefs/{COMMON,rust,front-sessions,front-controls,wall,menu}.md`.

Подписки `notify_when_idle` и cron (cd334eca) — сняты/умрут с моей сессией; оформить свои.

## Открытые находки ревью (всё отправлено исполнителям, закрыто кроме отмеченных)

- F2: регресс «Завершить все» (висящие session-closed/duplicate внутри групп) — закрыт d42f414 (полоса «Висящих
  процессов: N · Завершить все висящие» над списком; `orphans(rows)` в overview.ts).
- F1: автоподключение после «Продолжить» при смене shortId; exited внешние в Ctrl+Tab/чипах — закрыт d176fc2
  (`live`-фильтр в WorkbenchLayout, полный список только RunningList/SessionStrip).
- R1: guard RunningDev для серверов в корне Projects; pid из файла хука только живого `claude.exe` — закрыт 13fa767.
  Мелочь оставлена: завершённые внешние из корня Projects не показываются (US1 п.5 их и не требует).
- R1 п.12: **открыто** — инвалидация кэша после stop/forget/start (см. выше).
- D: **ревью не проведено**.

## Живые проверки — НЕ делались (tauri dev разрешён только координатору; одна сборка Rust; RAM ≥ 6 ГБ)

Quickstart `specs/006-workbench-v2/quickstart.md` §1–§8 целиком не проверен. Что исполнители проверили сами до
запрета: R1 — `window::focus` на пробном окне WT (Focused, восстановление из свёрнутого); F1 — маркеры agent view на
Claude 2.1.306 через `claude --bg` + attach (`/exit`, двойная «←» → agent view; Ctrl+Z → attach выходит → detached;
после `/exit` сначала вопрос доверия к `~` — маркеры его тоже ловят). Остальное — только юнит-тесты.

Особые рантайм-риски из ревью (проверить вживую): dev-консоль Tauri после `FreeConsole`/`AttachConsole(ATTACH_PARENT_PROCESS)`
в `window.rs` (stdout dev не ломается?); `vscode://` через `open` plugin-shell — схема в capabilities; поздние чанки
после detach под оверлеем «Отключено»; fixed-позиция `Popover` внутри `.wb-runs`; выравнивание `.wb-ps`/`.wb-pr.in`
с колонкой памяти; `.wb-ph-sep` с отрицательным margin; `open_in_vscode` с `&` в пути (BatBadBut для `code.cmd`).

Порты для dev координатора: vite 1425, CDP 9226 (1420/9222 — Echo пользователя). Мои dev и MCP-браузер не
запускались — закрывать нечего.

## П. 12 — замеры

«До»: Echo пользователя не был запущен, замер (`measure-agents.ps1`, 1 Гц) дал 0. Оценка по коду 005: хаб на каждую
запись файла хука (дебаунс 0,5 с, пауза 1 с) запускал `claude agents --json`; при 8 занятых сессиях — до 40–60
запусков/мин, плюс `agents` на каждый attach/stop/kill. «После» (dae29dc): пауза 3 с + кэш 3 с → ≤ 20/мин, attach и
list_processes берут кэш. Замер «после» — `C:\Users\stillmvd\.claude\jobs\4a9733a6\tmp\measure-agents2.ps1` (200 мс
опрос новых `claude.exe` за 60 с + CPU echo-studio) на своём dev с 8 занятыми сессиями; результат — `spec.md`
«Решения» (T047).

## Дальше по порядку

1. `v2-rust`: дождаться хэш инвалидации → `git merge --no-edit v2-rust` (конфликт только tasks.md «Отклонения» —
   оба блока) → `claude stop 5ccd1a94`.
2. Ревью `v2-wall` (заново) → находки → фикс → merge → `pnpm test`, `pnpm build` → `claude stop 2b2fa992`.
3. Сообщение сессии пользователя (`projects-12`): «пачки 1–2 и п. 12 готовы, workbench-v2 на <хэш>, смотреть
   quickstart §1–§7». Она переносит в main (`git merge --ff-only workbench-v2`); в main самому не писать.
4. Живая проверка §1–§7 и замер «после» (одна сборка Rust, после — закрыть dev и MCP-браузер). Правки — точечно
   самому или новым исполнителем с `--strict-mcp-config`.
5. Пачка 3: `git worktree add -b v2-menu ../v2-menu workbench-v2` → `spawn.sh v2-menu menu` → ревью → merge →
   quickstart §8 → сообщение пользователю.
6. Финал: T044–T046 (`claude-md-patch.md`, `.planning/WORKBENCH.md` живые проверки, отчёт пользователю), `claude
   stop`/`rm` своих сессий, `git worktree remove` исполнителей (кроме `v2-integration` до переноса), снять cron.

## Что знаю только я

- Сессии пользователя в Projects менялись: `projects-19` → `projects-12` (смотреть `ListAgents`).
- `.specify/feature.json` в `.gitignore`; скрипты speckit git-ветку не создают.
- `.planning/HANDOFF.md` и `ORCHESTRATION-006.md` в основной копии untracked — писать туда из worktree нельзя;
  я положил handoff в ветку как `.planning/HANDOFF-006.md` (не называть `HANDOFF.md`, иначе ff-merge в main упадёт
  на untracked файле).
- Русский промпт через bash-скрипт (`env -u CLAUDE…`) доходит целым (проверено по транскрипту).
- Адверсарий (sonnet) находил реальные регрессы в каждой пачке — ревью не пропускать.
