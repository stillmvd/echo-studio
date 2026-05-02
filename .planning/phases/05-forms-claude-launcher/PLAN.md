# Phase 5 — Forms + Claude Code Launcher

## Goal

Возможность редактировать существующие memories напрямую через форму
(SQL update head-fields + body, без синхронизации markdown — per A-25),
создавать новые memories через интегрированную команду «Open in Claude
Code» (Claude вызовет `memory_save` MCP-tool с правильным markdown), и
исследовать существующие memories той же командой.

## Definition of Done

- [ ] `update_memory(id, patch)` Rust-команда: PATCH через UPDATE с
      backup. Поля: title, what, why, impact, category, tags, body
      (через memory_details).
- [ ] `open_in_claude_code(prompt, cwd?)` Rust-команда: spawn
      `wt -d <cwd> claude` (Windows Terminal с Claude Code в нужной
      рабочей директории).
- [ ] Frontend: `EditMemoryDialog` — форма с полями head + body
      (textarea), Submit + Cancel.
- [ ] Frontend: `ClaudeCodeDialog` — 3 шаблона (Save / Update /
      Investigate), редактируемый prompt textarea, cwd input, кнопка
      Launch (копирует prompt в clipboard + spawn wt+claude).
- [ ] Кнопка «+ New memory» в TabBar / sidebar — открывает
      ClaudeCodeDialog с шаблоном Save.
- [ ] Active кнопки Edit и «Open in Claude Code» в MemoryDetail.
- [ ] Все pre-commit checks зелёные.

## Закрывает требования

- **FR-MEM-04** — частично: создание идёт через Open-in-Claude-Code
  (Claude вызывает memory_save MCP). Прямой form-create НЕ делаем,
  чтобы не нарушить A-25 (markdown sync).
- **FR-MEM-05** — Edit memory (SQL only; markdown остаётся stale до
  следующего CLI reindex; задокументировано в commit).
- **FR-MEM-09** — «Open in Claude Code» с 3 шаблонами.

## Tasks

### T-5.1 — Backend: MemoryPatch + update_in_tx

```rust
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPatch {
    pub title: Option<String>,
    pub what: Option<String>,
    pub why: Option<Option<String>>,        // double-Option для clear-to-null
    pub impact: Option<Option<String>>,
    pub category: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub body: Option<Option<String>>,        // None = unchanged, Some(None) = clear
}

impl EchoVaultRepo {
    pub fn update(&self, id: &str, patch: &MemoryPatch) -> Result<bool> { ... }
}
```

В transaction:
- backup_db()
- BUILD dynamic UPDATE memories SET ... WHERE id (только указанные поля)
- if body Some — UPSERT memory_details (INSERT OR REPLACE)
- updated_at = now, updated_count += 1

### T-5.2 — Backend: open_in_claude_code

```rust
#[tauri::command]
pub async fn open_in_claude_code(
    app: tauri::AppHandle,
    cwd: Option<String>,
    /* prompt передаётся через clipboard на фронте */
) -> Result<(), String> {
    let cwd = cwd.unwrap_or_else(|| dirs::home_dir().unwrap().to_string_lossy().into_owned());
    use tauri_plugin_shell::ShellExt;
    app.shell().command("wt").args(["-d", &cwd, "claude"]).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
```

Capabilities: `shell:allow-spawn` уже есть, но для конкретной команды
`wt` может потребоваться добавить allowlist.

### T-5.3 — Frontend: navigator.clipboard helper

`src/lib/clipboard.ts`:
```ts
export async function writeClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
```

### T-5.4 — Frontend: ClaudeCodeDialog

Три шаблона (генератор):
- **Save**: «Сохрани memory о теме [...]. Project: X. Context: ...
  Используй memory_save MCP-tool.»
- **Update**: «Обнови memory <id> ("<title>"). Текущее: what/why/...
  Изменения: ...»
- **Investigate**: «Исследуй memory <id> и related_files. Задача: ...»

UI: select template → preview prompt в textarea (editable) → input для
cwd (default: project's cwd guess или home) → Launch button. Launch:
1. `await writeClipboard(prompt)`
2. `await invoke('open_in_claude_code', { cwd })`
3. Show toast «Opened in Claude Code. Prompt copied to clipboard —
   paste in terminal with Ctrl+Shift+V.»

### T-5.5 — Frontend: EditMemoryDialog

Modal с формой:
- title (input)
- category (select: decision/pattern/bug/context/learning/none)
- tags (chip input — push-Enter add, ✕ remove)
- what (textarea, required)
- why, impact (textareas, optional)
- body (textarea monospace, optional)

Submit → `useUpdateMemory().mutateAsync({ id, patch })` → invalidate
queries → close.

### T-5.6 — Wire actions

- `MemoryDetail.tsx`: Edit button → setEditing(true)
- `MemoryDetail.tsx`: «Open in Claude Code» button → setClaudeDialog
  with kind='update' (если selected memory) или 'investigate'
- `TabBar.tsx`: «+ New» button (или в sidebar header) → setClaudeDialog
  с kind='save'

### T-5.7 — Smoke + commit

`feat(05): edit memory form + claude code launcher with 3 templates`

## Не делаем в Phase 5

- ❌ Markdown sync при edit/create (A-25 invariant)
- ❌ Form-based create (используем Claude Code путь)
- ❌ Live markdown preview во время edit (split view) — Phase 11 polish
- ❌ Tag autocomplete из существующих — backlog
- ❌ Toast notifications — пока inline banner

## Риски

| Риск | Митигация |
|---|---|
| `wt` отсутствует на старых Win10 | Fallback: spawn `cmd /c start claude` или `pwsh -NoExit claude`. Phase 10 (Settings) добавит выбор терминала. |
| Tauri shell allowlist блокирует `wt` | Добавить в capabilities/default.json точечный `allow-spawn` для wt. |
| Edit нарушает A-25 (markdown drift) | Documented; EchoVault CLI reindex resyncs markdown. Tooltip предупреждает. |
| Очень длинные prompt'ы и clipboard | Browser/WebView2 поддерживает мегабайтные тексты в clipboard, проблем не ожидается. |
