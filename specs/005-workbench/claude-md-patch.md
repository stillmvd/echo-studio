# T055 — правка CLAUDE.md проекта (применяет пользователь)

Текст подготовлен сессией ядра 005; сам `CLAUDE.md` не менялся. Ниже — что добавить в существующие разделы.

## «Что это за проект» — первый абзац, после «…плагин `echo-memory` (`plugin/`), который её наполняет.»

```diff
-…раздел памяти Claude (auto memory) и плагин `echo-memory` (`plugin/`), который её наполняет. Windows-only, …
+…раздел памяти Claude (auto memory) и плагин `echo-memory` (`plugin/`), который её наполняет, и «Рабочее место» —
+проекты из `~/Projects`, фоновые сессии Claude в окне, dev-серверы и процессы проектов. Windows-only, …
```

## «Где смотреть контекст» — новый пункт 8

```diff
 7. `specs/004-memory/` — память: …
+8. `specs/005-workbench/` — Рабочее место: спека, план, задачи (раздел «Отклонения от формулировок»), research
+   (спайк attach, job dev-серверов), contracts/ipc.md; журнал стендов и живых проверок — `.planning/WORKBENCH.md`,
+   стенд — `.planning/sketches/301-workbench/`
```

## «Стек»

```diff
-- Rust: tauri 2, serde_json (`preserve_order`), serde_yaml, notify 8 + notify-debouncer-mini, thiserror 2.
+- Rust: tauri 2, serde_json (`preserve_order`), serde_yaml, notify 8 + notify-debouncer-mini, thiserror 2,
+  portable-pty (терминал `claude attach`), sysinfo (процессы проектов).
-- Frontend: React 19, TypeScript 7, Vite 8 (`@vitejs/plugin-react`), Vitest 5, Tailwind 4, TanStack Query/Virtual, zustand, react-resizable-panels 4 (`Group`/`Panel`/`Separator` + `useDefaultLayout`).
+- Frontend: React 19, TypeScript 7, Vite 8 (`@vitejs/plugin-react`), Vitest 5, Tailwind 4, TanStack Query/Virtual, zustand, react-resizable-panels 4 (`Group`/`Panel`/`Separator` + `useDefaultLayout`), xterm 6 (`addon-fit`, `addon-webgl`).
```

## «Ключевые инварианты» — новый пункт после «Сессии Claude (`.jsonl`)»

```diff
+- **Рабочее место** (`src-tauri/src/workbench/`): хост сессий — демон Claude Code: запуск `claude --bg` в папке
+  проекта (продолжение — строго `claude --bg --resume <id>`, без других флагов), экран — `claude attach <id8>` в
+  portable-pty, список — `claude agents --json` (только stdout; битый вывод — ошибка, не «живых нет») + хуки
+  `~/.claude/state/sessions`. Доверие папке Echo не ставит — «Папка не доверена» → открыть Claude в папке. Остановить
+  и убрать (`claude stop`/`rm`) и подключиться можно только к фоновой сессии из `agents` с `cwd` внутри известного
+  проекта; `rm` живой — отказ. Окружение дочерних процессов — без `CLAUDE*`.
+- **Dev-серверы** (`workbench/dev.rs`): отдельный процесс в именованном Job Object (handle наследуется до запуска —
+  после перезапуска Echo сервер находится по имени), лог — в `%LOCALAPPDATA%/<app id>/workbench/dev/<slug>.log`;
+  «Стоп» — завершение job и добор только по дереву процессов, виденному у этого job (пары pid + время старта),
+  браузеры и редакторы под ним не трогаются.
+- **Процессы проектов** (`workbench/processes.rs`, принцип VII конституции): `kill` — только pid из свежей
+  классификации, сверка по паре (pid, время старта), собственное дерево Echo исключено, чужие процессы не
+  показываются; живая сессия Claude и работающий dev — через `ConfirmDialog`, висящие — без подтверждения.
```
