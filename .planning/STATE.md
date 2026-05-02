# Echo Studio — STATE

> Текущее состояние проекта. Обновляется на каждом значимом шаге.

## Status: Phase 0 complete (skeleton)

- 2026-05-02 (init): проект создан, зафиксированы PROJECT.md, REQUIREMENTS.md (37 FR/NFR), ROADMAP.md (13 phases) → commit `1813264`
- 2026-05-02 (Phase 0): scaffold Tauri 2 + React 19 + TypeScript + Tailwind 4 + Biome 2 + lefthook. Hello-world UI с design tokens рендерится. Toolchain зелёный.

## Зафиксированные решения

См. `PROJECT.md → Ключевые архитектурные решения` (A-01..A-08).

## Открытые вопросы

- Brand: точный clone Claude Desktop (для личного использования). Если будет публичный релиз — переключим на свой бренд.
- Code-signing: отложено до v0.2.0.
- Embeddings provider: используем дефолт EchoVault (Ollama + nomic-embed-text), пользовательский config не переопределяем.

## Phase 0 — DoD checklist

- [x] `pnpm install` зелёный (10s)
- [x] `pnpm typecheck` без ошибок
- [x] `pnpm biome check .` без ошибок
- [x] `pnpm build` (vite + tsc) собирает frontend (194 KB JS + 6 KB CSS)
- [x] `cargo check` + `cargo clippy --all-targets -- -D warnings` зелёные
- [x] `cargo fmt --check` зелёный
- [x] `lefthook install` подключён (pre-commit: biome, typecheck, rust-fmt, rust-clippy)
- [x] `tauri-plugin-window-state` подключён в `lib.rs` (FR-COM-06)
- [x] Plugins shell/dialog/fs зарегистрированы в Rust + JS deps + capabilities
- [ ] *Manual:* `pnpm tauri dev` открывает окно «Echo Studio» 1280×800 — нужно проверить локально
- [ ] *Manual:* `pnpm tauri build` собирает release .exe < 15 MB — отложено до Phase 11/12

## Следующий шаг

Phase 1 — EchoVault read-repo: rusqlite + sqlite-vec, golden-tests против реальной `~/.memory/index.db`.

Команда для запуска: `/gsd:plan-phase 1` или просто продолжить вручную.
