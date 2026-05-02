# Phase 7 — Conversations: List

## Goal

Прочитать `~/.claude/projects/<encoded-cwd>/*.jsonl`, агрегировать по
проектам с counters, показать sortable список сессий справа: id, дата,
длительность, msgs, размер, gitBranch.

## Definition of Done

- [ ] Rust команды `list_conversation_projects()` и
      `list_conversation_sessions(project_id)`
- [ ] Папка проекта = decoded cwd (best-effort) + актуальный `cwd` из
      JSONL первой строки
- [ ] Каждая сессия: sessionId, file_path, size_bytes, message_count,
      first/last_event_at, duration_ms, git_branch, cwd
- [ ] Activate ConversationsTab в AppShell
- [ ] 2-pane layout: ProjectsSidebar (с counters и total size) + SessionTable
- [ ] SessionTable sortable по колонкам (date, size, duration, msgs)
- [ ] All pre-commit checks зелёные

## Закрывает требования

- **FR-CONV-01** Дерево по проекту + total size
- **FR-CONV-02** Список сессий sortable по любой колонке

## Tasks

### T-7.1 — Models + paths

```rust
pub struct ConversationProject {
    pub id: String,
    pub cwd: String,
    pub display_name: String,
    pub session_count: usize,
    pub total_size: u64,
    pub last_activity: Option<String>,
}

pub struct SessionMeta {
    pub session_id: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub message_count: u32,
    pub first_event_at: Option<String>,
    pub last_event_at: Option<String>,
    pub duration_ms: i64,
    pub git_branch: Option<String>,
    pub cwd: Option<String>,
}

pub fn projects_root() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}
```

### T-7.2 — Scanner

```rust
pub fn list_projects() -> Vec<ConversationProject>
pub fn list_sessions(project_id: &str) -> Vec<SessionMeta>
fn parse_session_meta(file: &Path) -> SessionMeta
```

`parse_session_meta` стримит JSONL построчно (BufRead), извлекает
sessionId, cwd, gitBranch из первой строки, count `type=user/assistant`,
sum `durationMs` из `turn_duration` событий, first/last timestamp.

### T-7.3 — Tauri commands

`commands::conversations::list_conversation_projects(),
list_conversation_sessions(project_id)`

### T-7.4 — Frontend

- `lib/types.ts`: ConversationProject, SessionMeta
- `lib/ipc.ts`: listConversationProjects, listConversationSessions
- `state/ui-store.ts`: + `conversationsProjectId`, `conversationsSortBy`,
  `conversationsSortDir`
- `components/conversations/ConversationsTab.tsx` — 2-pane
- `components/conversations/ProjectsSidebar.tsx`
- `components/conversations/SessionTable.tsx` — sortable columns

### T-7.5 — Smoke + commit

`feat(07): conversations list — parse jsonl headers + 2-pane viewer`

## Не делаем в Phase 7

- ❌ Открытие сессии (timeline) — Phase 8
- ❌ Поиск внутри сессии — Phase 8
- ❌ Удаление / экспорт — Phase 9
- ❌ Watch на projects directory — Phase 11 polish (manual refresh
  кнопка пока)

## Риски

| Риск | Митигация |
|---|---|
| Большие jsonl (10+ MB) | Стримовый парсинг через BufReader, не загружаем целиком |
| Проект без `cwd` в JSONL | Fallback на decoded folder name |
| Шумные `*.jsonl.tmp` | Фильтр по расширению строго `.jsonl` |
