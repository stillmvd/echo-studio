# IPC-контракт: Рабочее место v2

Дополнения к [005 contracts/ipc.md](../../005-workbench/contracts/ipc.md). Ошибки — строка; блокирующее — в
`spawn_blocking`.

## Изменённые команды

### `list_workbench_projects() -> ProjectTree`
- Папки, у которых `.git` — файл (worktree), пропускаются на обоих уровнях.
- Новое поле `root: string` — путь корня `Projects` (для подписи «Projects (корень)» на фронте).

### `list_claude_sessions() -> ClaudeSession[]`
- Плюс завершённые внешние сессии (R-02): `kind: external`, `status: exited`, `exitedAt`, `shortId: null`, `pid: null`;
  только если файл хука обновлялся ≤ 1 ч назад, `claudePid` не жив и `projectDir` внутри известного проекта.

### `list_processes() -> ProcessRow[]`
- Процессы с `cwd` == корень `Projects` (и сессии хука с `projectDir` == корень) получают `projectPath` = корень
  (правило `projects-root`), а не «без проекта».

## Новые команды

### `focus_session_window(pid: number, sessionId: string) -> FocusResult`
Guard: `sessionId` — UUID, `pid` принадлежит этой сессии по свежему `agents --json` или файлу хука; иначе ошибка.
Алгоритм — research R-01. Результат `'focused' | 'vscode' | 'not-found'`. При `vscode` фронт сам открывает
`vscode://stillmvd.claude-session-focus/focus?session=<sessionId>` через `open` из plugin-shell.

### `open_in_vscode(path: string) -> void`
Guard: `ensure_project(path)`. Запуск `code <path>` через `child_command` (`CREATE_NO_WINDOW`, без `CLAUDE*`); `code`
не найден в PATH → ошибка «VS Code не найден в PATH».

## Фронт (`src/lib/ipc.ts`)

```ts
focusSessionWindow(pid: number, sessionId: string): Promise<FocusResult>
openInVscode(path: string): Promise<void>
```

Копирование в буфер — `navigator.clipboard.writeText` (webview), без IPC.
