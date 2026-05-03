# Echo Studio — STATE

> Текущее состояние проекта. Обновляется на каждом значимом шаге.

## Status: Phase 10 complete — Settings + Geist fonts

- 2026-05-02 (init): commit `1813264`
- 2026-05-02 (Phase 0): `d7ff8e6` — Tauri 2 + React 19 skeleton
- 2026-05-02 (Phase 1): `f7df1b6` — read-repo + IPC
- 2026-05-02 (Phase 2): `894ec6b` — 3-pane layout
- 2026-05-02 (Phase 2 polish): `3c220ae` — dark scrollbars
- 2026-05-02 (Phase 3): `c9b9fa2` — filters + search
- 2026-05-02 (Phase 4): `1fabf35` — writes + bulk + backup
- 2026-05-02 (Phase 4 polish): `1c67474` — dark checkboxes
- 2026-05-03 (Phase 5): `5c6ca74` — edit form + Claude launcher
- 2026-05-03 (Phase 6): `4a7179f` — file watcher + reindex
- 2026-05-03 (Phase 7): `6c8e248` — conversations list
- 2026-05-03 (polish): `c3703cb` — collapsible tags + custom Select
- 2026-05-03 (Phase 8): `cdaf7eb` — conversations viewer + search
- 2026-05-03 (Phase 9): `60142d8` — conversations delete + export
- 2026-05-03 (viewer rewrite): `5d683c6` — chat-style render flatten content blocks
- 2026-05-03 (thinking fix): `a787a0d` — sealed marker (Anthropic encrypts)
- 2026-05-03 (Phase 10): Settings page + Geist fonts + polish

## Phase 10 — DoD checklist

- [x] `read_echovault_config` Rust command — parses `~/.memory/config.yaml`
      и резолвит memory_home/embedding/ollama_base_url с defaults.
- [x] `reveal_in_explorer(path)` — `explorer /select,<path>` (Windows-only).
- [x] SettingsLayout с 4 секциями: EchoVault paths/embedding/config /
      Database backups list (formatted timestamp, size, reveal button) /
      Conversations stats / About.
- [x] Geist Sans + Mono подключены через @fontsource (self-hosted, offline).
- [x] AppShell теперь рендерит SettingsLayout вместо placeholder.
- [x] Capabilities: shell:allow-spawn для `explorer`.
- [x] Все pre-commit checks зелёные.

## Зафиксированные решения

См. PROJECT.md (A-01..A-08), Phase 1-9 (A-09..A-35).

Phase 10 specifics:
- A-36: Settings — read-only display всех paths и configs. НЕ
  перезаписываем `~/.memory/config.yaml` из UI (per A-25 invariant —
  EchoVault владеет своим конфигом).
- A-37: Geist через @fontsource* для offline self-hosting (не CDN).
- A-38: thinking blocks от Anthropic API имеют `thinking: ""` —
  reasoning зашифрован в `signature`. Показываем static marker
  «sealed by Anthropic — content not accessible», не expand.

## Известные ограничения

- Restore from backup не реализован — owner может вручную скопировать
  старый `index.db` из `.backups/`.
- Light theme нет.
- Reveal in Explorer работает только на Windows (использует `explorer`).

## Следующий шаг

Phase 11 — QA pass: bug fixes, performance review, accessibility,
финальный manual UAT по checklist'у из PROJECT.md.
