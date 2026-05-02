# Echo Studio — PROJECT.md

## Идентификация

| Поле | Значение |
|---|---|
| Кодовое имя | Echo-Studio |
| Тип | Desktop GUI (Windows) |
| Платформа | Windows 10/11 x64 |
| Поставка | Portable .exe в ZIP |
| Лицензия | MIT |
| Owner | stillmvd (oldhoodschool@gmail.com) |
| Старт | 2026-05-02 |

## Цель

Локальное desktop-приложение для визуального управления артефактами Claude Code:
1. **EchoVault memories** (`~/.memory/`) — полный CRUD, фильтры, поиск (FTS+semantic), markdown-просмотр, кнопка «Open in Claude Code».
2. **Claude conversations** (`~/.claude/projects/`) — read-only просмотр, поиск, удаление старых сессий, экспорт.

## Зачем

Сейчас управление этими данными возможно только через CLI или ручную правку файлов. Visual-tool уберёт трение: видеть размеры, фильтровать по проектам, чистить старое, понимать что вообще накопилось.

## Не цели (out of scope)

- Cloud-sync, multi-device
- Редактирование conversations
- Встроенный AI-чат (создание идёт через «Open in Claude Code» → внешний `claude` CLI)
- macOS / Linux (Tauri это позволяет, но MVP1 — только Windows)

## Стек (зафиксирован)

```
Tauri 2 + Rust ─── rusqlite + sqlite-vec, notify, tokio, serde
       │
WebView2 ──── React 19 + TS 5.6 + Vite 6
              Tailwind 4 + shadcn/ui + Radix
              TanStack Query/Router/Virtual + Zustand
              react-markdown + shiki (Geist Sans/Mono)
```

## Ключевые архитектурные решения

| # | Решение | Обоснование |
|---|---|---|
| A-01 | Direct SQLite + Markdown access | Скорость UX, полный контроль над всеми полями (archived/superseded/anchors). Пересчёт embeddings — фоновым worker'ом через `memory reindex`. |
| A-02 | Single source of truth — `index.db` | Markdown в `vault/` пере-генерируется при каждой записи. Atomic tx → write file. |
| A-03 | Backup перед destructive ops | Копия `index.db` → `~/.memory/.backups/index.YYYYMMDD-HHMMSS.db`. Хранить последние 20. |
| A-04 | «Open in Claude Code» = spawn `wt claude --prompt-file` | Не реализуем встроенный API-чат (нет ключа в MVP). Используем установленный Claude Code CLI. |
| A-05 | 3-pane layout, drag-resizable | Стандарт для browse-tools (Notion/Obsidian/Claude Desktop). |
| A-06 | Точный clone стиля Claude Desktop (dark, orange) | Знакомый UX. *(Если возникнут brand-вопросы — переключаемся на «inspired-by» с собственным акцентом.)* |
| A-07 | Auto-sync FTS direct + background `memory reindex` для embeddings | FTS быстро обновляется в той же tx; embeddings через CLI асинхронно. |
| A-08 | Тестирование golden-tests против fixture-БД | Инвариант совместимости с EchoVault схемой. |

## EchoVault — техфакты (зафиксированы из исследования)

- Репо: https://github.com/mraza007/echovault, v0.4.0
- Хранилище: `~/.memory/` (override: `MEMORY_HOME` env → `~/.config/echovault/config.yaml`)
- Файлы: `index.db` (SQLite), `vault/<project>/...md` (Obsidian-style), `config.yaml`
- Схема `memories`: id (UUID), title, what, why, impact, tags (CSV), category, project, source, related_files, file_path, section_anchor, created_at, updated_at, status, archived_at, archive_reason, superseded_by
- Дополнительно: `memory_details(memory_id, body)`, FTS5-таблица, vec-таблица (sqlite-vec)
- Категории: `decision | pattern | bug | context | learning`
- Embeddings: Ollama / `nomic-embed-text` по умолчанию

## Conversations — техфакты

- Папка: `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`
- Encoded cwd: путь с `\:/` заменёнными на `--` (например `C--Projects-Windows-Apps-DOTA-COACH`)
- Формат: JSONL, по строке на событие
- Типы событий: `user`, `assistant`, `tool_use`, `tool_result`, `system` (subtype: `stop_hook_summary`, `turn_duration`, `away_summary`), `file-history-snapshot`
- Метаданные: `sessionId`, `cwd`, `timestamp`, `version`, `gitBranch`, `parentUuid`, `uuid`, `durationMs`
- Размер: 380 KB – 1+ MB на сессию

## Связанные проекты

- DOTA-COACH (рядом) — отдельный пет-проект, использует тот же стек паттернов (GSD, EchoVault, ast-index).
