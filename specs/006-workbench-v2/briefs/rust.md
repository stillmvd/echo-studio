# Бриф R1 «rust» — Rust-ядро и контракт IPC (пачка 1)

Имя сессии: `v2-rust`. Worktree: `.claude/worktrees/v2-rust`, ветка `v2-rust`. Порты для dev (если понадобится):
vite 1426, CDP 9227.

## Задачи (tasks.md): T002, T003, T004, T005, T017, T026, T042

Порядок: **T002 первым** — отдельный коммит `feat(workbench): IPC contract for v2` (только `src/lib/ipc.ts` и
`src/lib/types.ts`), сразу сообщи координатору хэш — фронт-исполнители ждут. Затем T003/T017/T026 параллельно, T004,
T005, T042.

## Файлы (только они)

`src-tauri/Cargo.toml`, `src-tauri/src/workbench/window.rs` (новый), `sessions.rs`, `projects.rs`, `processes.rs`,
`mod.rs`, `src-tauri/src/commands/workbench.rs`, `src-tauri/src/lib.rs`, `src/lib/ipc.ts`, `src/lib/types.ts`.

## Детали

- `window.rs`: см. research R-01. `windows-sys` уже в зависимостях — добавь фичи `Win32_System_Console`,
  `Win32_UI_WindowsAndMessaging` (проверь, какие уже есть). Предки процесса — `sysinfo` (`System::new`,
  `refresh_processes_specifics` с `ProcessRefreshKind::nothing()` — без cmd/cwd, чтобы было быстро), ищи
  `code.exe` без учёта регистра, глубина ≤ 30, защита от циклов. `AttachConsole` может вернуть 0 (у нашего процесса
  уже есть консоль — в dev-режиме Tauri консоль есть!): тогда сначала `FreeConsole()`, потом `AttachConsole(pid)`; в
  любом исходе в конце `FreeConsole()`. Окно псевдоконсоли — класс `PseudoConsoleWindow`; владелец через
  `GetAncestor(hwnd, GA_ROOTOWNER)`; если равен `hwnd` или `0` → `NotFound`. Перед `SetForegroundWindow` —
  `IsIconic` → `ShowWindow(SW_RESTORE)`.
- `sessions.rs`: `Status::Exited` добавить в enum (serde `exited`), `ClaudeSession.exited_at: Option<u64>`.
  `exited_external`: живость pid — `sysinfo` `System::process(Pid)` (`refresh_processes` `ProcessesToUpdate::Some(&[pid])`).
  `HookState` += `updated_at: Option<u64>`, `project_dir` уже есть. Порог 3600 с, `now` — `SystemTime` в мс
  (сравни единицы с `updatedAt` хука — там мс).
- `session_pid(session_id)`: сначала `run_agents()` (поле `pid`), потом файл хука `claudePid`.
- `projects.rs`: `ProjectTree.root` — путь корня в том виде, как даёт `projects_root()` (`to_string_lossy`).
  Обнови существующий тест `builds_groups_and_roots` (`tree.root`), добавь worktree-тест.
- `processes.rs`: не меняй поведение фикстуры `expected.json` (там `projectsRoot` — папка без процессов в корне);
  новый юнит-тест с `cwd == root`. Убедись, что `project_of` для `live.dir == root` тоже даёт root (сессия
  `projects-19` пользователя в корне).
- `commands/workbench.rs`: `focus_session_window(pid: u32, session_id: String) -> Result<window::Focus, String>`
  через `blocking`; `open_in_vscode(project_path: String)` — `ensure_project`, затем `child_command("cmd.exe")`
  `.args(["/c", "code", &path])` (`code` — `.cmd` в PATH; через `cmd /c` надёжнее), `spawn()`; ошибку spawn → строка.
  Зарегистрируй обе в `invoke_handler` в `lib.rs`.
- `ipc.ts`/`types.ts`: ровно как в `contracts/ipc.md` и `data-model.md`. В `types.ts` `SessionStatus` уже содержит
  `exited`.

## Живая проверка (обязательно)

Через `cargo test` и, для `focus`, маленький бинарный тест или `#[test] #[ignore]` с реальным pid: запусти `claude
--bg` в своём worktree? — нет, фокус нужен для *внешней* сессии. Проверка окна: возьми pid интерактивной сессии из
`claude agents --json` (`kind: interactive`, cwd `C:\Users\stillmvd\Projects` — это сессия пользователя; **её окно
выводить вперёд можно один раз для проверки**, это не вредит), вызови `window::focus(pid)` из `#[test] #[ignore]`
(`cargo test -- --ignored focus_live`) и убедись, что результат `Focused`. Запиши в отчёт.
