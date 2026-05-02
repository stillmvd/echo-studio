# Phase 6 — Auto-sync Engine

## Goal

Реактивно подхватывать изменения `~/.memory/index.db` извне (когда
EchoVault MCP-сервер пишет через Claude Code), и предоставлять кнопку
ручного reindex для пересчёта vector embeddings после наших edit/delete
операций. Нижний статус-бар показывает «watching», количество memories
и индикатор reindex-а.

## Definition of Done

- [ ] `notify` crate watches `~/.memory/index.db`. При внешней модификации
      (debounced 500ms) Rust-сторона emit'ит Tauri event `echovault://changed`.
- [ ] Frontend подписан на event и вызывает `invalidateQueries(['memories'])`.
- [ ] Tauri command `trigger_reindex` спавнит `memory reindex` (либо
      bundled путь Python Scripts/memory.exe). Стримит stdout-строки
      через event `echovault://reindex-progress`. Финальный event
      `echovault://reindex-done` или `echovault://reindex-error`.
- [ ] Status bar внизу AppShell:
      - `N memories · watching ●` (зелёная точка если watcher активен)
      - правее: «Reindex embeddings» button + прогресс при работе
- [ ] FilterBar при работающем reindex показывает баннер «Embeddings
      regenerating — semantic search may be incomplete»
- [ ] Capabilities: shell:allow-spawn для `memory` exe
- [ ] Все pre-commit checks зелёные

## Закрывает требования

- **FR-MEM-10** Auto-sync индексов (FTS — автоматом через DB triggers,
  embeddings — ручной reindex с UI кнопкой)
- **FR-COM-02** Hot-reload при внешних изменениях файлов

## Tasks

### T-6.1 — notify dep + file_watcher service

```toml
notify = "6"
notify-debouncer-mini = "0.4"
```

`src-tauri/src/services/file_watcher.rs`:
```rust
pub fn start_watching(app: AppHandle, db_path: PathBuf) -> Result<()> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut debouncer = new_debouncer(Duration::from_millis(500), tx)?;
    debouncer.watcher().watch(&db_path, RecursiveMode::NonRecursive)?;
    std::thread::spawn(move || {
        for events in rx { /* emit Tauri event */ }
    });
}
```

Стартуется в `lib.rs::run()` через setup hook.

### T-6.2 — trigger_reindex command

```rust
#[tauri::command]
pub async fn trigger_reindex(app: AppHandle) -> Result<(), String> {
    let mut cmd = app.shell().command("memory").args(["reindex"]).spawn()?;
    /* stream stdout, emit progress events */
}
```

Поиск `memory.exe`: сначала PATH, fallback на `~/AppData/Local/Python/
pythoncore-*/Scripts/memory.exe` через glob.

### T-6.3 — Frontend StatusBar

`src/components/layout/StatusBar.tsx`:
- Слева: `{total} memories · watching {indicator}`
- Справа: «Reindex embeddings» button + progress text при работе
- Listen `echovault://reindex-progress` и `echovault://reindex-done/error`

### T-6.4 — Event listener в App

`src/hooks/use-db-watcher.ts`:
```ts
useEffect(() => {
  const unlisten = listen('echovault://changed', () => {
    queryClient.invalidateQueries({ queryKey: ['memories'] });
  });
  return () => unlisten.then(fn => fn());
}, []);
```

### T-6.5 — Smoke + commit

`feat(06): file watcher + reindex worker + status bar`

## Не делаем в Phase 6

- ❌ Авто-spawn `memory reindex` после каждой нашей write-op — ручная
  кнопка для контроля. Phase 10 (Settings) добавит флажок auto-reindex.
- ❌ Прогресс-бар percentage (показываем raw output line)
- ❌ Watcher на `vault/` файлы — фокус на index.db (SOT)

## Риски

| Риск | Митигация |
|---|---|
| `memory.exe` не в PATH | Fallback glob поиск Python Scripts |
| Watcher срабатывает на наши WAL writes | DB пишется через WAL mode → notify видит .db-wal изменения. Watch только index.db (без -wal/-shm), debounce 500ms. |
| reindex медленный (>30s) | Без блокировки UI; user может продолжать работу |
