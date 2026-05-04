# Echo Studio — STATE

> Финальное состояние MVP1.

## Status: SHIPPED — v0.1.0 portable release

- 2026-05-04 (release): https://github.com/stillmvd/echo-studio/releases/tag/v0.1.0
  - `EchoStudio-v0.1.0-x86_64-portable.zip` (4.3 MB)
  - `Echo Studio.exe` 8.3 MB single binary

## История коммитов (high-level)

| Commit | Phase | Что |
|---|---|---|
| 1813264 | init | планирование, 37 FR/NFR, 13-фазный roadmap |
| d7ff8e6 | 0 | Tauri 2 + React 19 skeleton |
| f7df1b6 | 1 | EchoVault read-repo + IPC |
| 894ec6b | 2 | 3-pane layout, virtualized list, markdown |
| 3c220ae | 2 polish | dark scrollbars |
| c9b9fa2 | 3 | filters + search (FTS5+semantic+RRF) |
| 1fabf35 | 4 | writes + bulk + backup |
| 1c67474 | 4 polish | dark checkboxes |
| 5c6ca74 | 5 | edit form + Claude Code launcher |
| 4a7179f | 6 | file watcher + reindex + status bar |
| 6c8e248 | 7 | conversations list (jsonl scanner) |
| c3703cb | 7 polish | collapsible tags + custom Select |
| cdaf7eb | 8 | conversations viewer + search |
| 60142d8 | 9 | conversations delete + export |
| 5d683c6 | 8 rewrite | chat-style viewer (flatten content blocks) |
| a787a0d | 8 fix | thinking blocks sealed marker |
| d1af074 | 10 | Settings + Geist fonts |
| 874e982 | polish | sort tag chips alphabetically |
| bd51300 | fix | prune stale tag filter after delete |
| adbadef | 11 | session titles (custom-title / ai-title) |
| 58a74ec | 11 | error boundary + lazy markdown + Esc |
| 42f4694 | 12 | release prep — README, LICENSE, Cargo profile, bundle metadata |
| c45c1fc | 12 polish | dark title bar, transitive size opt |
| b301d02 | 12 | app icons + windows optimization doc |
| 1c61fc5 | 12 | gitignore dist-portable |

## Финальный артефакт

| Field | Value |
|---|---|
| Repo | github.com/stillmvd/echo-studio (public) |
| License | MIT |
| Tag | v0.1.0 |
| .exe size | 8.3 MB (`opt-level=s, lto, strip, panic=abort`) |
| ZIP size | 4.3 MB |
| WebView2 | system runtime (downloadBootstrapper fallback) |
| Title bar | Dark theme на Win10 1809+ / Win11 |
| Telemetry | none |

## Зафиксированные решения

См. PROJECT.md (A-01..A-08), Phase 1-10 (A-09..A-38).

Phase 12 specifics:
- A-39: Portable distribution через `pnpm tauri build --no-bundle`
  + ручная упаковка ZIP (PowerShell Compress-Archive). Нет
  installer'а, нет admin-прав требуемых.
- A-40: Cargo release profile максимально размер-ориентирован
  (opt-level=s, lto, codegen-units=1, strip, panic=abort,
  +transitive deps). Dev build не задет.
- A-41: README не упоминает Claude/Anthropic per owner request.
  «AI coding agent» / «agent CLI» нейтральные термины.
- A-42: `.planning/` override в локальном .gitignore чтобы global
  ~/.gitignore_global не excluded planning docs.

## Что осталось НЕ сделано (на будущее)

См. README.md → Roadmap:
- Restore from backup в Settings
- Light theme
- macOS / Linux builds
- Plugin/skill viewer
- MCP server inspector
- Code signing (требует EV-cert)
- Single-instance lock (`tauri-plugin-single-instance`)
- Auto-updater (`tauri-plugin-updater`)
