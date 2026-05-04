# Echo Studio

A portable Windows desktop app for browsing, searching and managing your local **EchoVault** memory store and your AI coding agent's session logs — without leaving the keyboard.

> Dark-themed, single-window, no installer, no telemetry. Drop the `.exe` anywhere and run.

---

## Why

If you use [EchoVault](https://github.com/mraza007/echovault) as a long-term memory store for AI coding agents, you already have hundreds of memory entries and gigabytes of session transcripts piling up on disk. The CLI is great for capturing, but reviewing, editing, and pruning that data through `memory list` or by hand-walking JSONL files in a text editor gets old fast.

Echo Studio gives that data a home:

- **Memories** tab — every record in `~/.memory/` with full-text and semantic search, filters, archive/delete, and inline markdown rendering.
- **Conversations** tab — every JSONL session log from your AI agent CLI rendered as a chat instead of cryptic JSON, with cross-session search and bulk cleanup.
- **Settings** tab — a single place to see where your data lives, how big it is, and which embedding model is configured.

Nothing leaves your machine. No accounts. No background sync.

---

## Features

### Memories

- 3-pane layout: project tree → virtualized list → detail
- Full-text search (FTS5) with highlighting in titles
- Filter by project, category, tag, date range, status
- Sort by updated / created / title / project
- Inline markdown rendering with syntax highlighting
- Edit head fields and body
- Archive (with reason) / restore / hard-delete
- Bulk select and bulk action bar
- **Backup before every destructive op** — last 20 copies of `index.db` kept under `~/.memory/.backups/`
- **Open in agent CLI** button with three prompt templates (save / update / investigate) — copies the prompt to clipboard and spawns a Windows Terminal in the right working directory

### Conversations

- Read-only viewer for `*.jsonl` session logs
- Group by project, sort by date / size / duration / message count
- **Chat-style timeline** — user / assistant messages rendered as markdown, tool calls collapsed with primary argument visible (`Bash: ls -la`, `Read: src/foo.ts`), tool results expandable on click
- Custom and AI-generated session titles (with `/rename` support in supported agent CLIs, falls back to UUID prefix when neither is set)
- In-session filter and **cross-session search** across all sessions of a project
- Age filter (older than 30 / 90 / 365 days) for cleanup
- Bulk-delete with confirmation
- Export any session as readable markdown

### Quality of life

- File watcher: external changes to `~/.memory/index.db` (e.g. when an agent saves a memory in another window) refresh the UI automatically — no F5
- Manual `memory reindex` trigger from the status bar
- Drag-resizable panels with size persistence
- Geist Sans/Mono, dark theme tuned to match popular AI desktop apps
- Window position and size remembered across launches
- Top-level error boundary with stack trace and "Try again" button
- Keyboard: `Esc` exits the session viewer

---

## Install

### Portable (recommended)

1. Download `EchoStudio-vX.Y.Z-x86_64-portable.zip` from the [Releases](https://github.com/stillmvd/echo-studio/releases) page.
2. Extract anywhere — for example `C:\Programs\Echo Studio\`.
3. Run `Echo Studio.exe`.
4. Optional: right-click the `.exe` → **Pin to Start**.

### Requirements

- Windows 10 (1809+) or Windows 11
- [Microsoft Edge WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) — pre-installed on Windows 11; on Windows 10 the app will prompt to install it on first launch
- For semantic search: [Ollama](https://ollama.com) running locally with the embedding model EchoVault uses (default `nomic-embed-text`). Without Ollama the app falls back to lexical search and shows a one-line warning — everything else works fine.
- For "Reindex embeddings" button to work: the `memory` CLI from EchoVault must be on `PATH` or installed under `%LOCALAPPDATA%\Python\pythoncore-*\Scripts\memory.exe`.

EchoVault itself is **not bundled** — install it separately following [its docs](https://github.com/mraza007/echovault).

---

## Quick start

1. Launch the app. If `~/.memory/index.db` exists, the **Memories** tab shows everything immediately.
2. Pick a project from the left sidebar.
3. Click any memory → see it rendered on the right.
4. Hit `Ctrl+F` (browser default) or just start typing in the search box — try a tag name or part of a title.
5. Switch to **Conversations** to browse session logs the same way.

---

## Build from source

```powershell
git clone https://github.com/stillmvd/echo-studio.git
cd echo-studio
pnpm install
pnpm tauri build --bundles none
```

The portable `Echo Studio.exe` ends up in `src-tauri/target/release/`.

### Stack

- [Tauri 2](https://tauri.app) (Rust + WebView2)
- [React 19](https://react.dev) + TypeScript 5.8
- [Tailwind CSS 4](https://tailwindcss.com) with OKLCH design tokens
- [TanStack Query / Virtual](https://tanstack.com)
- [`rusqlite`](https://docs.rs/rusqlite) + [`sqlite-vec`](https://github.com/asg017/sqlite-vec) for the EchoVault index
- [Biome 2](https://biomejs.dev) for linting and formatting
- [Lefthook](https://github.com/evilmartians/lefthook) pre-commit hooks (biome + tsc + cargo fmt + cargo clippy)

---

## Privacy

- 100% local. No telemetry, no analytics, no crash reports.
- The only network calls are to your local Ollama instance (`http://localhost:11434`) when you use semantic search. Nothing else.
- Read-only by default for the conversation tab. Memory writes only happen when you confirm a destructive action — and a backup is taken first.

---

## License

MIT — see [LICENSE](LICENSE).

This project is an independent tool. It reads files produced by [EchoVault](https://github.com/mraza007/echovault) (MIT) and is not affiliated with EchoVault's authors.
