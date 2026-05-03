# Phase 8 — Conversations: Viewer + Search

## Goal

Открыть сессию (`session.jsonl`) → timeline по событиям, in-session
search (client-side filter), cross-session search через scan всех
JSONL текущего проекта.

## Definition of Done

- [ ] `read_session(file_path)` Rust команда → Vec<SessionEvent> со
      streaming JSONL parser, summary-текстом каждого события (200
      chars), raw JSON для inspection.
- [ ] `search_in_sessions(project_id, query, max_results)` —
      сканирует все jsonl, возвращает hits с sessionId/uuid/preview.
- [ ] Клик по строке сессии → SessionViewer вместо таблицы (back-кнопка
      возвращает).
- [ ] SessionViewer: timeline с типизированным badge для каждого
      event (user/assistant/tool_use/tool_result/system). Click row →
      expand full content. Virtualized для длинных сессий.
- [ ] In-session search box — client-side filter timeline по тексту.
- [ ] Cross-session search в sidebar — show hits с link на сессию +
      uuid. Click hit → открывает viewer, скроллит к event.
- [ ] All checks зелёные.

## Закрывает требования

- **FR-CONV-03** Просмотр сессии: timeline по типам событий
- **FR-CONV-04** Поиск внутри сессии
- **FR-CONV-05** Кросс-сессионный поиск по проекту

## Tasks

### T-8.1 — Backend: SessionEvent + read_session

```rust
pub struct SessionEvent {
    pub uuid: String,
    pub parent_uuid: Option<String>,
    pub timestamp: Option<String>,
    pub event_type: String,
    pub subtype: Option<String>,
    pub role: Option<String>,
    pub summary: String,
    pub raw: serde_json::Value,
}

pub fn read_session(path: &Path) -> Result<Vec<SessionEvent>, String>
```

Парсер построчно. Для `summary`:
- user/assistant: extract from `message.content` (string или first
  text block)
- tool_use: `tool_name(args_keys...)`
- tool_result: first 200 chars of content или first stdout line
- system: subtype + key info (stopReason, durationMs)

### T-8.2 — Backend: search_in_sessions

```rust
pub struct SessionSearchHit {
    pub session_id: String,
    pub file_path: String,
    pub uuid: String,
    pub timestamp: Option<String>,
    pub event_type: String,
    pub preview: String,
}

pub async fn search_in_sessions(project_id, query, max_results) -> Vec<SessionSearchHit>
```

Простая case-insensitive substring search в `summary` (вычисляемом
inline без полного парсинга). Limit 200 hits.

### T-8.3 — Frontend: ui-store

- `+ selectedSessionPath: string | null`
- `+ sessionSearchQuery: string` (in-session)
- `+ crossSessionSearchQuery: string`

### T-8.4 — Frontend: hooks

- `useSessionEvents(filePath)` — query for read_session
- `useCrossSessionSearch(projectId, query)` — debounced query

### T-8.5 — Frontend: SessionViewer

3-зонный right pane:
- Header: «← Back» + sessionId + meta + in-session search input
- Timeline: virtualized list, каждый row — type-badge + timestamp
  + summary (truncated). Click row — expand inline.
- Empty state если 0 events после filter

### T-8.6 — Frontend: CrossSessionSearchPanel

В sidebar над project list (либо в session table header). Простой
поиск; результаты — список с group by session, click → открывает viewer.
В Phase 8 пока без auto-scroll к event'у — просто открывает session
viewer + ставит in-session query = текущий cross query, чтобы он
сразу подсветил.

### T-8.7 — Wire-up

ConversationsLayout: правый Panel рендерит либо SessionTable либо
SessionViewer в зависимости от selectedSessionPath.

### T-8.8 — Smoke + commit

`feat(08): conversations viewer + in-session/cross-session search`

## Не делаем в Phase 8

- ❌ Edit conversations (out of scope)
- ❌ Auto-scroll к точному event (Phase 11 polish)
- ❌ Streaming render для огромных JSONL (>20MB) — pre-load всех
  events в память. Если файлы будут проблемой — Phase 11 lazy load.

## Риски

| Риск | Митигация |
|---|---|
| Большие сессии (1MB JSONL) | tested: streaming parser <800ms target |
| Длинный textuel content в content blocks | summary truncate 200 chars; raw JSON в expanded view |
| Cross-session scan медленный (50+ MB total) | hard limit 200 hits + early return; запускается debounced |
