# Research: Уведомления агентов и одинаковые инструменты

## R1. Как Claude Code разрешает одноимённые инструменты

- **Decision**: skills/commands — personal (global) > project; любой skill > любой команды; skills и команды
  плагинов в своём пространстве имён и не конфликтуют. Agents — project > user (> plugin). MCP — local >
  project > user (> plugin).
- **Rationale**: документация Claude Code: `code.claude.com/docs/en/skills.md` («Enterprise over personal, and
  personal over project… `/deploy` runs the personal one»; «A skill and a file in `.claude/commands/`» → «The
  skill»; «Plugin skills are namespaced»), `sub-agents.md`, `mcp.md#mcp-installation-scopes`. Сверено
  2026-09-26.
- **Alternatives**: симметричный «same name» (v0.3.1) — вводит в заблуждение: проектная копия, перекрытая
  глобальной, выглядит рабочей.
- **Уточнение**: плагины в перекрытиях не участвуют совсем (для agents/MCP плагинов имена в сессии получают
  префикс плагина; риск ложной пометки выше пользы). Выключенные элементы не загружаются — не участвуют.

## R2. Где считать копии в других проектах

- **Decision**: новый IPC `list_tool_copies` — один индекс на всё приложение: `scan_root` по `~/.claude`
  (Global), `.claude` каждого доступного известного проекта (`known_scopes`) и по папкам установленных
  плагинов; для каждого skill/command/agent — путь, хэш содержимого, mtime. Фронтенд группирует по
  `(kind, name.toLowerCase())`.
- **Rationale**: один запрос на все строки (счётчик «also in N» нужен в списке сразу), переиспользует
  существующий сканер; кэш TanStack Query сбрасывается существующим событием `tooling://changed`.
- **Alternatives**: запрос на элемент при открытии деталей — не даёт счётчик в строке; расширить
  `scan_tool_scope` — раздувает каждый скан обходом всех проектов.

## R3. Сравнение содержимого

- **Decision**: `DefaultHasher` по байтам файла (skill — `SKILL.md`, command/agent — сам `.md`); сравнение хэшей
  внутри одного ответа. Нечитаемый файл — `hash: null`.
- **Rationale**: хэш не хранится между запусками, стабильность между версиями Rust не нужна; зависимость не
  добавляется (принцип VI).
- **Alternatives**: md5/sha — лишняя зависимость; нормализация переводов строк — CRLF/LF-различие реально
  означает разные файлы, пусть будет «Differs».

## R4. Распознавание уведомления агента

- **Decision**: чистая функция `parseAgentNotice(item)` во фронтенде: признак `raw.origin.kind ===
  "task-notification"`, либо (нет `origin`) текст начинается с `<task-notification>`; из текста — `<summary>`
  (без хвоста ` finished`/префикса `Agent "…"` — берётся строка в кавычках, иначе вся), `<status>`, `<result>`.
  Нет `<status>` и `<summary>` — не уведомление, старый вид.
- **Rationale**: `DisplayItem.raw` уже содержит запись целиком; бэкенд не меняется.
- **Факты**: в логах пользователя статусы completed 2655, failed 572, killed 51, stopped 22, running 1.

## R5. Группа «Inherited from Global»

- **Decision**: в области проекта элементы origin `project`/`local` — «свои», `user`/`plugin` и сами плагины —
  в группе. Группа — строка того же виртуализатора, что группы skills (стенд 5); внутри при типе Skills
  работают группы по вендору. Ключ раскрытия — отдельное поле в ui-store.
- **Rationale**: переиспользует механизм групп; «Project only» становится лишним.

## R6. Проигравший «свой» в перекрытии

- **Decision**: вложенность «проигравший под победителем» (стенд 3 C) остаётся для случаев внутри одного
  раздела; если победитель в группе «Inherited», а проигравший — свой, проигравший остаётся наверху среди
  своих с пометкой. Точная форма — стенд 8.
