# Handoff 004-memory — 2026-09-29

Ветка `004-memory`. Работа по spec-kit: `spec.md` (Clarifications), `plan.md`, `research.md` (R1–R11 + «Проверено на
живой сессии», US1/US2/US5–US8), `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md` (отметки `[X]`).

## Готово

- **Плагин `echo-memory`** (`plugin/`, README там же): Stop → итог сессии, SessionStart → протокол + блок 3 сессий
  в `MEMORY.md` + закреплённые записи целиком, PostToolUse → scrub, PreToolUse(Read) → записи по `files:`,
  SessionEnd → extractive-черновик, `/echo-memory:remember`, `/echo-memory:reflect`. Проверено вживую
  (`claude -p --plugin-dir plugin`), 31 тест. Не установлен у пользователя — ставит сам (`/plugin marketplace add`).
- **Бэкенд Echo Studio** `src-tauri/src/memory/` + `commands/memory.rs`: скан, поиск, правка, архив/отмена, перенос,
  дубли (Dice ≥ 0.72), патч frontmatter, слияние, watcher `memory://changed`; копии в `memory-backups`.
- **Раздел Memory** (`src/components/memory/`, `MemoryLayout.tsx`) по стенду 201 (выбор в `.planning/MEMORY-STANDS.md`),
  ревью исправлено, пользователь посмотрел: «выглядит хорошо».
- `/redesign-stand` стал глобальным (`~/.claude/commands/`, `~/.claude/tools/redesign/`), паспорта «Стенды» в
  CLAUDE.md 7 проектов (правки в других репо не закоммичены).

## Дальше (по порядку)

1. **T056–T057** — закрепление сильнее факта (решение в spec Clarifications): Rust `is_pinned` только по факту,
   `bodyChars`, плашка о бюджете закреплённых, живая проверка SessionStart с закреплённой записью.
2. **T036** — прогон quickstart §4 строки 1–6 (пользователь смотрел раздел, формально не прогнан).
3. **T037** — стенд дублей и слияния (`/redesign-stand`, `.planning/sketches/202-memory-dupes/`), потом T041–T042.
4. **T054** — все гейты, quickstart целиком, SC-001 по ≥ 20 реальным сессиям.

## Грабли

- Claude Code нормализует frontmatter файлов памяти: наверху только `name`/`description`, остальное — в `metadata:`.
- Dev Echo делит порты с Booked (1420/9222). Если занято — 1425/9226 через `--config` (паспорт в CLAUDE.md).
- Heredoc в Git Bash здесь съедает `\\` — файлы с обратными слэшами писать через Write/Edit.
- `pnpm biome check .` падает на `public/favicon.svg` из main (`c64bfd5`) — не наше.
