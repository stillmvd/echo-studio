# Tasks: Память Claude Code

**Input**: Design documents from `specs/004-memory/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R11), data-model.md, contracts/hooks.md, contracts/ipc.md, quickstart.md

**Tests**: конституция требует unit-тесты чистой логики — включены: Vitest для `plugin/lib/*.mjs` и `src/lib/memory.ts`,
`cargo test` для `src-tauri/src/memory/`. Хуки целиком и UI проверяются по quickstart.md на живой сессии и в приложении.

**Дизайн**: раздел памяти — новый UI → стенд в стиле после редизайна (Trail), без вариантов ошибок; журнал —
`.planning/MEMORY-STANDS.md`, стенды — `.planning/sketches/2NN-memory-<компонент>/`. Задача «стенд» — точка
остановки: реализацию UI не начинать без выбора пользователя.

**Проверки после каждой фазы**: `pnpm biome check .`, `pnpm typecheck`, `pnpm test`, `pnpm build`; при правках Rust —
`cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` и
`cargo test --manifest-path src-tauri/Cargo.toml`. Коммит фазы — после «коммить» пользователя.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно параллельно (разные файлы, нет зависимостей от незавершённых задач)
- **[Story]**: US1–US8 из spec.md

---

## Phase 1: Setup (каркас плагина)

- [X] T001 Создать `.claude-plugin/marketplace.json` в корне репо: `name: echo-studio`, `owner.name: stillmvd`, плагин `echo-memory` с `source: ./plugin` (contracts/hooks.md «Упаковка»)
- [X] T002 [P] Создать `plugin/.claude-plugin/plugin.json`: `name: echo-memory`, `version: 0.1.0`, `description`, без зависимостей
- [X] T003 [P] Создать `plugin/lib/run.mjs`: `run(handler)` — читает stdin JSON (таймаут 2 с), вызывает handler, печатает не больше одного JSON, любое исключение → пустой stdout, строка `ISO-время hook сообщение` в `%TEMP%/claude-memory/errors.log`, `process.exit(0)`; хелпер `writeAtomic(path, text)` (temp рядом → rename)
- [X] T004 [P] Создать `plugin/lib/paths.mjs`: `projectRoot(cwd)` — вверх до `.git` (файл `.git` → `gitdir:` → `commondir` → корень основного репо), иначе `cwd`; `slug(root)` — каждый символ вне `[A-Za-z0-9]` → `-`; `memoryDir(cwd)` = `~/.claude/projects/<slug>/memory`; `statePath(sessionId)` = `%TEMP%/claude-memory/<id>.json`; `loadState`/`saveState` с полями HookState из data-model.md (R1)
- [X] T005 Создать `plugin/hooks/hooks.json` с 5 хуками по таблице contracts/hooks.md (matcher, `node "${CLAUDE_PLUGIN_ROOT}/hooks/<скрипт>"`, timeout) и заглушки `session-start.mjs`, `post-write.mjs`, `pre-read.mjs`, `session-end.mjs` на `run()` с пустым выходом
- [X] T006 Каркасный `plugin/hooks/stop.mjs` для ранней проверки: пишет вход в `%TEMP%/claude-memory/probe.log`, блокирует `{"decision":"block","reason":"probe: ответь одним словом «ок»"}` только если в состоянии нет флага `probed`, ставит флаг
- [X] T007 **Живая проверка** по quickstart.md §0–§1: установить плагин, подтвердить `stop_hook_active` (false → true), шаблон строки `/remember` в JSONL, совпадение `memoryDir` с реальной папкой, видит ли Claude изменённый хуком `MEMORY.md` в той же сессии, доходит ли `additionalContext` из PreToolUse(Read) до Claude (временная заглушка `pre-read.mjs` с меткой); дописать итог в `specs/004-memory/research.md` (подраздел «Проверено на живой сессии» у R1–R5); расхождения — поправить plan/tasks до Phase 3

**Checkpoint**: плагин ставится, хуки вызываются, допущения R1–R5 подтверждены.

---

## Phase 2: Foundational (общие чистые функции плагина)

- [X] T008 [P] `plugin/lib/transcript.mjs`: `readSince(path, offset)` → новые строки JSONL (битая строка пропускается) и новое смещение; `tally(lines, state)` — `user_count` (`type: user`, текстовое содержимое, не `tool_result`, не `isMeta`), `edited` (`tool_use` с `name` ∈ `Edit|Write|MultiEdit|NotebookEdit`), `remember` (шаблон из T007), `first_prompt`, `touched` (пути из `tool_input.file_path`), 3 последние текстовые реплики (R2)
- [X] T009 [P] `plugin/lib/frontmatter.mjs`: `parse(text)` → `{ fields, body, error }` (YAML-подмножество: скаляры, списки `- x` и `[a, b]`, вложенный `metadata:`; фолбэк построчно `ключ: значение`) (сериализация не нужна: черновик и блок собираются строкой)
- [X] T010 [P] `plugin/lib/scrub.mjs`: `scrub(text)` — `[REDACTED]` для `sk-…`/`sk-ant-…`, `ghp_|gho_|ghs_|github_pat_…`, `xox[abp]-…`, `AKIA[0-9A-Z]{16}`, `AIza…`, JWT `eyJ….….…`, PEM-блоков, `(password|secret|token|api_key)\s*[:=]\s*\S+`, содержимого `<private>…</private>`; вырезать `<system-reminder>…</system-reminder>`, `<task-notification>…</task-notification>`, `<memory-context…>…</memory-context>` (R6)
- [X] T011 [P] Тесты `plugin/lib/transcript.test.mjs`, `plugin/lib/frontmatter.test.mjs`, `plugin/lib/scrub.test.mjs`: фикстуры JSONL (сообщения, tool_result, isMeta, правки, `/remember`, битая строка, чтение со смещения); frontmatter (валидный, битый YAML, неизвестные ключи, порядок); набор секретов SC-005 — ни один не уцелел, обычный текст не тронут

**Checkpoint**: `pnpm test` зелёный на `plugin/lib`.

---

## Phase 3: User Story 1 — Итог сессии пишется сам (P1) 🎯 MVP

**Goal**: после значимой работы Claude сам пишет заметку сессии и записи, без действий пользователя.
**Independent Test**: quickstart.md §2.

- [X] T012 [US1] `plugin/lib/decide.mjs`: `shouldBlock(state, { stopHookActive, remember })` по R3 — `stop_hook_active` → нет; `remember` → да; значимо (`edited || user_count ≥ 8`) и (`noted_at == null || user_count − noted_at ≥ 15`) → да; `notePath(state, now, sessionId)` → `sessions/YYYY-MM-DD_<первые 8 символов id>.md`, дата фиксируется при первом вызове
- [X] T013 [P] [US1] Тест `plugin/lib/decide.test.mjs`: правка → блок; 7 сообщений без правок → нет; 8 → да; после блока 14 сообщений → нет, 15 → да; `stop_hook_active` → нет; `/remember` в короткой сессии → да; путь заметки стабилен между вызовами
- [X] T014 [US1] `plugin/prompts/summary.md` (русский): заметка по пути `{{note_path}}` в `{{memory_dir}}` с frontmatter `session_id: {{session_id}}`, `capture: claude`, `updated`, `title`, 5 разделов `## Запрос`, `## Изучено`, `## Узнали`, `## Сделано`, `## Дальше` (по абзацу), перезапись той же заметки; отдельные записи только `kind` ∈ `decision|gotcha|bugfix|feature|discovery` с примерами «плохо/хорошо» и списком «не писать» (пересказ кода, git-история, временное); формат записи по data-model.md (`status: observation`, `seen: 1`, `importance: 2`, строка в `MEMORY.md`); перед записью Grep по памяти, при совпадении `seen++` вместо новой; ключи на английском, текст на русском; в конце — одна строка пользователю
- [X] T015 [US1] `plugin/hooks/stop.mjs` вместо каркаса: состояние → `readSince`/`tally` → `shouldBlock` → при блоке `noted_at = user_count`, `note_path`, `reason` из `summary.md` с подстановкой `{{note_path}}`, `{{session_id}}`, `{{date}}`, `{{memory_dir}}`; сохранить состояние; убрать `probe.log`
- [X] T016 [P] [US1] `plugin/hooks/post-write.mjs`: `tool_input.file_path` — `.md` внутри `memoryDir(cwd)` → `scrub`, `writeAtomic` только при изменении (FR-005)
- [X] T017 [P] [US1] `plugin/commands/remember.md`: frontmatter `description`, текст по contracts/hooks.md «/remember»
- [X] T018 [US1] Прогон quickstart.md §2 на живой сессии (включая fail-open через временный `throw`) и замер времени Stop < 200 мс на транскрипте ≥ 5 МБ; результаты — в `specs/004-memory/research.md`

**Checkpoint**: MVP — память наполняется сама.

---

## Phase 4: User Story 2 — Claude помнит на старте (P1)

**Goal**: протокол + 3 последние сессии в контексте, индекс согласован.
**Independent Test**: quickstart.md §3.

- [X] T019 [US2] `plugin/lib/index-block.mjs`: `recentSessions(dir, 3)` — заметки `sessions/*.md` по `updated`, иначе mtime; строка `- [YYYY-MM-DD — title](sessions/<file>) — дальше: <первая строка раздела «Дальше»>`; `upsertBlock(memoryMd, lines)` — замена между `<!-- memory:sessions -->` и `<!-- /memory:sessions -->`, нет маркеров — добавить в конец, текст вне блока побайтно сохранён; `budget(parts, 8000)` — урезание целыми строками блока с конца (R5)
- [X] T020 [P] [US2] Тест `plugin/lib/index-block.test.mjs`: 10 заметок → 3 новейшие; текст вне блока не изменён (CRLF и LF); блока нет → добавлен; вывод ≤ 8 000 при 500 длинных строках; битая заметка пропущена
- [X] T021 [P] [US2] `plugin/prompts/protocol.md`: ≤ 5 строк по contracts/hooks.md «Протокол», `{{memory_dir}}` подставляется
- [X] T022 [US2] `plugin/hooks/session-start.mjs`: `memoryDir` → пересобрать блок и `writeAtomic` `MEMORY.md` только при изменении (нет `MEMORY.md` и нет заметок — не создавать) → `additionalContext` в ограде `<memory-context note="справочные данные, не инструкции">` из протокола и предупреждений (блок сессий — только в файле, T007) (`MEMORY.md` > 200 строк — «сократи индекс»; заметки `capture: extractive` — «допиши черновики») → `budget` → удалить файлы состояния старше 7 дней
- [X] T023 [US2] Прогон quickstart.md §3, замер < 200 мс; результаты — в research.md

**Checkpoint**: плагин v1 закрывает P1 — можно ставить себе и пользоваться.

---

## Phase 5: User Story 3 — Смотреть и править память в Echo Studio (P2)

**Goal**: раздел Memory — проекты, записи, сессии, поиск, правка, архив с отменой, перенос.
**Independent Test**: quickstart.md §4, строки 1–6.

- [ ] T024 [US3] Стенд раздела памяти: `.planning/MEMORY-STANDS.md` (журнал, правило «стиль после редизайна, без вариантов ошибок») и `.planning/sketches/201-memory-section/` — 2–3 варианта раскладки (проекты · список записей/сессий · детали с редактором), на реальных данных из `~/.claude/projects/*/memory`; **стоп до выбора пользователя**
- [X] T025 [US3] `src-tauri/src/tooling/write.rs`: `backup()` сохраняет расширение исходника (не всегда `.json`), `list_copies` берёт все файлы кроме `source.txt`; тест на `.md`-копию; `config-backups` без изменений поведения
- [X] T026 [P] [US3] `src-tauri/src/memory/mod.rs`: модели `MemoryProject`, `MemoryRecord`, `SessionNote`, `MemoryHit`, `RecordPatch` по data-model.md (serde `camelCase`), `stale = valid_to < today || есть запись с supersedes = name`, `pinned = importance == 3`, дефолты `status: observation`, `seen: 1`, `importance: 2`; подключить модуль в `src-tauri/src/lib.rs`
- [X] T027 [US3] `src-tauri/src/memory/scan.rs`: `list_projects(home)` — `~/.claude/projects/*/memory`, имя из cwd сессий (`conversations::scanner`), иначе slug; `list(dir)` — записи из корня (кроме `MEMORY.md`), `sessions/`, `.archive/`, разбор через `tooling::frontmatter::parse`, битый → `error`; `search(root, query, slug?)` — подстрока без учёта регистра, без `.archive/`, до 200 совпадений; тесты на временной папке (битый frontmatter, кириллица, пустая папка)
- [X] T028 [US3] `src-tauri/src/memory/index.rs`: `remove_links(md, file)`, `append_line(md, line)` (перед блоком `<!-- memory:sessions -->`, если он есть), `line_for(record)` = `- [name](file.md) — description`, `replace_line(md, file, line)`; текст вне затронутых строк не меняется; тесты
- [X] T029 [US3] `src-tauri/src/memory/write.rs`: `guard(path)` — `ensure_allowed` в `~/.claude/projects`, компонент `memory`, `.md`; `save_text`, `archive` (в `.archive/`, коллизия → `-2`, `-3`…), `restore`, `move_to(slug)` — каждый шаг: перечитать → `backup` в `memory-backups` → temp → rename → правка `MEMORY.md` (тоже с копией) по R9; тесты на временной папке: архив + отмена возвращают файл и строку, перенос переносит строку, путь вне памяти отклонён
- [X] T030 [US3] `src-tauri/src/memory/watch.rs`: watcher `~/.claude/projects` рекурсивно, фильтр — компонент `memory` в пути, игнор `.echo-studio.tmp`, дебаунс 500 мс, событие `memory://changed` с `[{ slug }]`; запуск в `src-tauri/src/lib.rs` рядом с `tooling::watch::start`
- [X] T031 [US3] `src-tauri/src/commands/memory.rs`: `list_memory_projects`, `list_memory`, `read_memory_file`, `search_memory`, `save_memory_file`, `archive_memory_record`, `restore_memory_record`, `move_memory_record` по contracts/ipc.md, всё в `spawn_blocking`, корень копий `app_data_dir/memory-backups`; регистрация в `generate_handler!` в `src-tauri/src/lib.rs`
- [X] T032 [P] [US3] Типы и обёртки `invoke` в `src/lib/types.ts` и `src/lib/ipc.ts`; `src/lib/memory.ts` — фильтры по `kind`, `status`, дате, `stale`, группировка записей/сессий; тест `src/lib/memory.test.ts`
- [X] T033 [US3] `src/hooks/use-memory.ts`: запросы `['memory','projects']`, `['memory', slug]`, поиск с `use-debounced-value`, мутации с инвалидацией, подписка на `memory://changed`
- [X] T034 [US3] Навигация: `AppTab` `'memory'` в `src/state/ui-store.ts` (+ выбранный проект/запись), пункт Memory в `src/components/layout/NavRail.tsx`, маршрут в `src/components/layout/AppShell.tsx`
- [X] T035 [US3] `src/components/layout/MemoryLayout.tsx` и `src/components/memory/*` по выбору на стенде T024: проекты со счётчиками, записи и сессии отдельно, фильтры, поиск, детали через `Markdown`, редактор текста, «Удалить» → тост «Отменить» (`restore_memory_record`), «Перенести в проект…», предупреждение `MEMORY.md` > 200 строк; модальные — через `ConfirmDialog`; список виртуализирован
- [ ] T036 [US3] Прогон quickstart.md §4 (строки 1–6) в `pnpm tauri dev`

**Checkpoint**: память видна и правится из приложения.

---

## Phase 6: User Story 4 — Чистка и слияние (P2)

**Goal**: дубли, слияние ≤ 3 клика, закрепление, устаревание, «## Факты».
**Independent Test**: quickstart.md §4, строки 7–8.

- [ ] T037 [US4] Стенд `.planning/sketches/202-memory-dupes/`: вкладка «Дубли» по всем проектам и диалог слияния (выбор каноничной, предпросмотр итога); **стоп до выбора пользователя**
- [X] T038 [P] [US4] `src-tauri/src/memory/dupes.rs`: нормализация (нижний регистр, без пунктуации, `-` → пробел), Dice по биграммам, `score = max(name, description)`, пары внутри проекта `score ≥ 0.72`, без архива и записей с `error`, по убыванию; тесты (одинаковые, перестановка слов, кириллица, пустые)
- [X] T039 [US4] `src-tauri/src/memory/write.rs`: `patch(path, RecordPatch)` — ключи в `serde_yaml::Mapping` с сохранением порядка, тело не трогается; `status: fact` или `importance: 3` → строка в `## Факты` (секция после первого заголовка или в начале), обратно — в общий список; `merge(canonical, absorbed)` по R10 (`Merged from <name> (<дата>)`, объединение `tags`/`files`, `seen` — сумма, `importance` — максимум, поглощённые с `consolidated_into` в `.archive/`, их строки убраны); тесты
- [X] T040 [US4] Команды `find_memory_duplicates`, `patch_memory_record`, `merge_memory_records` в `src-tauri/src/commands/memory.rs` + регистрация; обёртки в `src/lib/ipc.ts`, мутации в `src/hooks/use-memory.ts`
- [ ] T041 [US4] UI по стенду T037 в `src/components/memory/`: вкладка «Дубли», диалог слияния (каноничная по умолчанию: выше `importance`, затем `seen`, затем старше), действия «Закрепить», «Факт», «Устарела» (`valid_to` = сегодня, опционально `supersedes`), пометка устаревших в списке
- [ ] T042 [US4] Прогон quickstart.md §4 (строки 7–8), слияние ≤ 3 клика (SC-006)

**Checkpoint**: P2 закрыт.

---

## Phase 7: User Story 5 — Наблюдение становится фактом (P3)

- [X] T043 [US5] Дозакрыть FR-003 (T014 даёт `seen++`, эта задача — продвижение в факт): уточнить в `plugin/prompts/summary.md` и `plugin/prompts/protocol.md` правило `seen`: найти запись Grep'ом по ключевым словам, `seen++`, `updated`, при `seen ≥ 2` — `status: fact` и перенос строки в `## Факты` в начале `MEMORY.md` (создать секцию, если нет); строки вне этого — не трогать
- [X] T044 [US5] Прогон quickstart.md §5 US5

## Phase 8: User Story 6 — Контекст при чтении файла (P3)

- [X] T045 [US6] `plugin/lib/file-map.mjs`: `buildFileMap(memoryDir)` — `{ relPath: [{ record, description, mtime }] }` из `files:` записей (нормализация слэшей и регистра Windows); тест `plugin/lib/file-map.test.mjs`
- [X] T046 [US6] `plugin/hooks/session-start.mjs`: сохранить `file_map` в состояние; `plugin/hooks/pre-read.mjs`: путь относительно `projectRoot(cwd)` в карте, размер ≥ 1 500 байт, mtime файла ≤ mtime записи, нет в `injected` → `additionalContext` по contracts/hooks.md, добавить в `injected`
- [X] T047 [US6] Прогон quickstart.md §5 US6, замер < 100 мс

## Phase 9: User Story 7 — Страховка из транскрипта (P3)

- [X] T048 [US7] `plugin/hooks/session-end.mjs`: дочитать JSONL (`readSince`/`tally`), значимо и нет файла `note_path` (или его ещё нет в состоянии) → черновик по data-model.md (`capture: extractive`, `## Первый запрос`, `## Последние реплики` по 500 символов, `## Тронутые файлы`), `scrub`, `writeAtomic`; тест сборки черновика в `plugin/lib/draft.test.mjs` (функция `buildDraft` в `plugin/lib/draft.mjs`)
- [X] T049 [US7] Прогон quickstart.md §5 US7 (закрыть окно без итога → черновик → старт предлагает дописать)

## Phase 10: User Story 8 — /reflect (P3)

- [X] T050 [US8] `plugin/commands/reflect.md` по contracts/hooks.md «/reflect»: необработанные заметки (нет в `.reflect.log`), CLAUDE.md проекта и `~/.claude/CLAUDE.md`, поправки ≥ 2 раз и нарушения правил → список «источник → предлагаемая правка», CLAUDE.md не менять, дописать обработанные имена в `.reflect.log`
- [X] T051 [US8] Прогон quickstart.md §5 US8

---

## Phase 10b: Закрепление сильнее факта (решение 2026-09-29, spec Clarifications)

- [X] T055 [US4] Плагин: `plugin/lib/pinned.mjs` (`readPinned`, `fitPinned`) + `session-start.mjs` — полный текст записей `importance: 3` в `additionalContext` после протокола и предупреждений, лишние целыми записями отрезаются, в предупреждение — «Не влезли закреплённые записи: …»; тест `pinned.test.mjs`
- [ ] T056 [US4] Rust `src-tauri/src/memory/write.rs`: `is_pinned` → только `status == "fact"` (в `## Факты` переносит только факт, закрепление строку индекса не двигает); поправить тест `patch_keeps_order_and_moves_the_index_line`; добавить в `MemoryRecord` поле `bodyChars` (длина тела без frontmatter) в `scan.rs`/`mod.rs` и `src/lib/types.ts`
- [ ] T057 [US4] Echo Studio: плашка в шапке проекта, если сумма `bodyChars` закреплённых записей > ~6 500 символов («Закреплённые не влезут в старт сессии: N из 6 500») и подсказка у кнопки «Закрепить» — «полный текст в каждой сессии проекта»; проверить вживую SessionStart с закреплённой записью (`claude -p --plugin-dir plugin` в пробном репо, `MSYS_NO_PATHCONV=1`)

## Phase 11: Polish

- [X] T052 [P] `plugin/README.md`: установка, хуки, формат файлов, как выключить, где лог ошибок
- [X] T053 [P] Обновить `CLAUDE.md` проекта: плагин `plugin/`, модуль `memory/`, инвариант записи памяти (копия → temp → rename, guard `~/.claude/projects/*/memory`), `specs/004-memory/` в «Где смотреть контекст»
- [ ] T054 Полный прогон гейтов и quickstart.md целиком; проверить SC-001…SC-006 (SC-001 — по заметкам последних ≥ 20 реальных сессий с правками из JSONL: доля с заметкой ≥ 95 %); итоги — в research.md

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → US1 → US2**: плагин строго по порядку; T007 (живая проверка) блокирует всё после Phase 1.
- **US3** зависит только от Phase 1–2 по данным (формат файлов), кодом — независим от плагина; начинается после US2
  по порядку из плана. T024 (стенд) блокирует T035; T025 блокирует T029.
- **US4** — после US3 (модуль `memory/`, команды, раздел). T037 блокирует T041.
- **US5** — после US1 (инструкция) и US4 (Echo Studio уже переносит строки в `## Факты`).
- **US6, US7** — после US2 (состояние, `session-start.mjs`); друг от друга независимы.
- **US8** — после US1 (заметки есть).
- **Polish** — последним.

## Parallel Opportunities

- Phase 1: T002, T003, T004 одновременно.
- Phase 2: T008, T009, T010 одновременно, затем T011.
- US1: T016, T017 параллельно с T012–T015.
- US2: T020, T021 параллельно с T019.
- US3: T026 и T032 параллельно с T025/T027.
- US4: T038 параллельно с T039.
- P3: US6 и US7 — разные файлы, параллельно после US2.

## Implementation Strategy

1. **MVP** — Phase 1–3 (US1): живая проверка Stop, затем автозахват итога. Уже заменяет claude-mem.
2. **Плагин v1** — + US2: память на старте. Точка, где плагин ставится себе насовсем.
3. **Echo Studio** — US3, затем US4, каждая через стенд.
4. **P3** — US5 → US6/US7 → US8, каждая закрывается своим прогоном quickstart.
