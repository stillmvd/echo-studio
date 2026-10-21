# Handoff — Echo Studio (2026-10-21), координатор 006

(Файл лежит в ветке `workbench-v2`, не в `.planning/HANDOFF.md` основной копии: фоновая сессия не может писать в
общую копию. После переноса ветки в main — слить с `HANDOFF.md`.)

## Следующая сессия — координатор 006 (Рабочее место v2), продолжение

Оркестрация по `.planning/ORCHESTRATION-006.md` основной копии (все правила, включая «Нагрузка на ПК» и п. 12).
Интеграционная ветка `workbench-v2` в worktree `.claude/worktrees/v2-integration` (координатор работает оттуда:
`EnterWorktree path`; если Bash отказывает «working directory resolved to the shared checkout» — `ExitWorktree keep`
→ `EnterWorktree path` заново). Спека — `specs/006-workbench-v2/` (spec «Решения», plan таблица владения, tasks,
briefs, `journal.md` — журнал оркестрации с хэшами).

Состояние: пачка 1 (п. 1–8) целиком в `workbench-v2`, проверки зелёные (biome, typecheck, vitest 166, build, clippy
в хуке). П. 12 (производительность, P0) — ветка `v2-rust` dae29dc + правка «инвалидация кэша после stop/forget/start»
(запрошена, ждём хэш) → merge. Пачка 2 — ветка `v2-wall` adb66ce на ревью (adversary-агент; находки → `v2-wall` →
фикс → merge). Пачка 3 (меню, бриф `briefs/menu.md`) не начата — только после п. 12. Живые проверки quickstart §1–§8
не делались (tauri dev — только координатор, одна сборка Rust за раз, RAM ≥ 6 ГБ).

Живые сессии: `v2-rust` (5ccd1a94), `v2-wall` (2b2fa992). Остановлены (не `rm`): `v2-front-sessions` (76f2c7c9),
`v2-front-controls` (6db6b32f). Worktree исполнителей: `.claude/worktrees/v2-{rust,front-sessions,front-controls,wall}`.

## Дальше

1. Дождаться `v2-rust` (инвалидация кэша) → `git merge --no-edit v2-rust` (конфликт только в tasks.md «Отклонения» —
   оставить оба блока) → `claude stop 5ccd1a94`.
2. Ревью `v2-wall` (если результата нет — `Agent adversary model sonnet`, дифф `git diff 1e46396...v2-wall`) →
   находки исполнителю → merge → `pnpm test`, `pnpm build` → `claude stop 2b2fa992`.
3. Сообщить сессии пользователя в Projects (`ListAgents`, имя `projects-NN`; были `projects-19`, `projects-12`):
   «пачки 1–2 и п. 12 готовы, ветка workbench-v2 на <хэш>, что смотреть (quickstart §1–§7)» — она переносит в main.
4. Живая проверка: dev из `v2-integration` на 1425/9226 (одна сборка Rust, RAM ≥ 6 ГБ; после — закрыть dev и
   MCP-браузер): quickstart §1–§7 + замер «после» п. 12 скриптом
   `C:\Users\stillmvd\.claude\jobs\4a9733a6\tmp\measure-agents2.ps1` (200 мс опрос новых `claude.exe` за 60 с).
   Результаты — `spec.md` «Решения» и `.planning/WORKBENCH.md`.
5. Пачка 3: `git worktree add -b v2-menu ../v2-menu workbench-v2`, запуск
   `bash C:\Users\stillmvd\.claude\jobs\4a9733a6\tmp\spawn.sh v2-menu menu` (скрипт с `--strict-mcp-config` и
   очисткой `CLAUDE*`; при другом job-dir — скопировать). Ревью → merge → quickstart §8 → сообщение пользователю.
6. Финал: T044–T046 (quickstart, `claude-md-patch.md`, отчёт), `claude stop`/`rm` своих сессий, `git worktree remove`
   исполнителей; `v2-integration` оставить до переноса; CronDelete своего cron.

## Открытые вопросы

- Замер «до» п. 12 не удался (Echo пользователя не был запущен). Оценка по коду 005: дебаунс 0,5 с + пауза 1 с →
  при 8 занятых сессиях до 40–60 запусков `claude.exe agents` в минуту; после — ≤ 20. Подтвердить замером «после».
- `vscode://` через `open` plugin-shell — схема может быть не разрешена в capabilities; проверить в §1.

## Помнить

- Исполнителей запускать только `--strict-mcp-config` (без него ~10 MCP-процессов на сессию); на экране пользователя
  ничего не открывать; хук `bg-load-guard` отказывает командам со словами cargo/rustc при живой сборке — проверку
  процессов писать через переменные (`$n = 'rustc.exe'`).
- lefthook в `v2-integration` на коммит с Rust-файлами гоняет clippy (~2 мин) — тоже «сборка Rust».
- Адверсарий (sonnet) находил реальные регрессы в каждой пачке (kill-all, exited в Ctrl+Tab, guard корня, pid
  хука, кэш после stop) — ревью не пропускать.
