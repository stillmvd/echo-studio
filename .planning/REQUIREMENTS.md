# Echo Studio — REQUIREMENTS.md

> Стиль: каждое требование — falsifiable. Phase mapping в ROADMAP.md.

## Memories (FR-MEM)

| ID | Требование | Приёмка | Phase |
|---|---|---|---|
| FR-MEM-01 | Список memories с фильтрами project/category/tags/status/date | Все 5 фильтров активны одновременно, результат корректен | 3 |
| FR-MEM-02 | Гибридный поиск: FTS5 + semantic (sqlite-vec) | Toggle режима: lexical / semantic / hybrid | 3 |
| FR-MEM-03 | Detail view: head fields + размер + markdown body (rendered + raw) | Все поля схемы видны; toggle render/raw | 2 |
| FR-MEM-04 | Создание memory через форму | После Submit запись видна в списке без перезапуска | 5 |
| FR-MEM-05 | Редактирование memory | Изменения попадают в `index.db` И `vault/<project>/<file>.md` | 5 |
| FR-MEM-06 | Archive (status=archived + reason) | По умолчанию скрыт; toggle «Show archived» | 4 |
| FR-MEM-07 | Hard-delete с confirm | row из 4 таблиц удалён; markdown section вырезан; backup создан | 4 |
| FR-MEM-08 | Bulk archive/delete по фильтру | Выделение многих + одна операция; прогресс-бар | 4 |
| FR-MEM-09 | «Open in Claude Code» с шаблонами | Открывается WT с `claude --prompt-file <tmp>`; шаблонов 3 | 5 |
| FR-MEM-10 | Auto-sync индексов | После write FTS обновлён в той же tx; `memory reindex` spawn'ится | 6 |

## Conversations (FR-CONV) — read-only

| ID | Требование | Приёмка | Phase |
|---|---|---|---|
| FR-CONV-01 | Дерево по проекту + total size | Decoded cwd → читаемое имя | 7 |
| FR-CONV-02 | Список сессий: id, дата, длительность, msgs, размер, gitBranch | Sortable по любой колонке | 7 |
| FR-CONV-03 | Просмотр сессии: timeline по типам событий | Streaming-парсинг, рендер за < 800мс для 5 MB | 8 |
| FR-CONV-04 | Поиск внутри сессии (по тексту сообщений) | Подсветка совпадений, jump-to | 8 |
| FR-CONV-05 | Кросс-сессионный поиск по проекту | Возвращает session+offset; click → открытие | 8 |
| FR-CONV-06 | Bulk-delete старых сессий («> N дней») | Confirm + размер освобождённого места | 9 |
| FR-CONV-07 | Export сессии в markdown | Один файл `<sessionId>.md` с роль-метками | 9 |

## Common (FR-COM)

| ID | Требование | Приёмка | Phase |
|---|---|---|---|
| FR-COM-01 | Dark theme — точный clone Claude Desktop | Палитра + типографика по дизайн-токенам из PROJECT.md | 10 |
| FR-COM-02 | Hot-reload при внешних изменениях файлов | Сторонняя правка `index.db` → invalidate query через 500мс | 6 |
| FR-COM-03 | Settings page: пути MEMORY_HOME / claude projects / claude.exe | Изменение пути сохраняется и применяется без рестарта | 10 |
| FR-COM-04 | Status bar: индикатор reindexing + count + version | Виден в любом месте приложения | 10 |
| FR-COM-05 | Drag-resize panes с persist | Ширина сохранена в localStorage / app config | 2 |
| FR-COM-06 | Window state persist | Position + size + maximized сохраняется через tauri-plugin-window-state | 0 |

## Нефункциональные (NFR)

| ID | Требование | Метрика |
|---|---|---|
| NFR-01 | Холодный старт ≤ 1.5 с до first paint | Devtools Performance |
| NFR-02 | Список 1000+ memories без лагов | 60 fps scroll |
| NFR-03 | Portable .exe ≤ 20 MB | `du -h dist/EchoStudio.exe` |
| NFR-04 | Не пишет в `~/.memory/` без явного подтверждения | Manual UAT + интеграционный тест |
| NFR-05 | Backup перед destructive ops | Файл в `.backups/` существует |
| NFR-06 | Работает offline | Network panel пуст при старте |
| NFR-07 | i18n-ready (RU first, EN later) | Все строки через i18n hook |
| NFR-08 | Корректно ведёт себя при заблокированной `index.db` | Retry / читать через WAL / показать тост |

## Out of scope (зафиксировано)

- Editing conversations
- AI-чат внутри приложения
- MCP/Skills/Commands viewer (отложено в v0.3)
- Cloud sync
- Code-signing (опционально, после v0.2)
- macOS / Linux build
