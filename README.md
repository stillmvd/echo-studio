# Echo Studio

A portable Windows desktop app for seeing the tools your AI coding agent CLI loads — skills, plugins, MCP servers, commands and agents, globally and per project — and for browsing its session logs, without leaving the keyboard.

> Dark-themed, single-window, no installer, no telemetry. Drop the `.exe` anywhere and run.

---

## Why

After a few months with an agent CLI you have dozens of skills, several plugins and MCP servers spread across a global config, per-project folders and plugin caches — and gigabytes of session transcripts on disk. Finding out what a given project actually loads, or switching one tool off, means reading several JSON files by hand.

Echo Studio gives that data a home:

- **Tools** tab — every skill, plugin, MCP server, command and agent, grouped by scope (global, then each project), with the effective set a project sees and switches to turn tools on and off.
- **Conversations** tab — every JSONL session log rendered as a chat instead of cryptic JSON, with cross-session search and bulk cleanup.
- **Settings** tab — where the config and session data live, and the config backups the app has made.

Nothing leaves your machine. No accounts. No background sync.

---

## Features

### Tools

- Scopes: global and every known project (from session logs and the agent's config); missing project folders are marked
- Filter by type — skills, plugins, MCP servers, commands, agents — and search by name and description
- **Effective view for a project** — global + project + enabled plugins, with the source of each item and same-name overrides nested under the winner
- Details for each item: rendered `SKILL.md` / command / agent file, MCP command line and environment, plugin contents and version
- **Turn tools on and off** — plugins, MCP servers and skills, using only the agent's own settings keys; in a project scope the switch writes only to that project's local settings
- **Backup before every write** — a copy of the config file goes to `%APPDATA%\<app id>\config-backups\`, last 20 per file kept
- Broken front matter or JSON marks only its own item or file — everything else still shows
- The list refreshes by itself when a config file or skill folder changes

### Conversations

- Viewer for `*.jsonl` session logs — session files are never modified; only delete removes them, and only inside `~/.claude/projects`
- Group by project, sort by date / size / duration / message count
- **Chat-style timeline** — user / assistant messages rendered as markdown, tool calls collapsed with primary argument visible (`Bash: ls -la`, `Read: src/foo.ts`), tool results expandable on click
- Custom and AI-generated session titles (with `/rename` support, falls back to UUID prefix when neither is set); renames made in the app are stored in `~/.claude/echo-studio-titles.json`
- In-session filter and **cross-session search** across all sessions of a project
- Age filter (older than 30 / 90 / 365 days) for cleanup
- Bulk-delete with confirmation
- Export any session as readable markdown

### Quality of life

- Drag-resizable panels with size persistence
- Window position and size remembered across launches
- Top-level error boundary with stack trace and "Try again" button
- Keyboard: `Esc` closes details and exits the session viewer (first `Esc` leaves the filter field)

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

---

## Quick start

1. Launch the app. The **Tools** tab opens on the global scope.
2. Pick a project on the left to see everything that project loads.
3. Click any item → its file and details open on the right.
4. Flip the switch in a row, or use **Turn off / Turn on** in the details, to change it.
5. Switch to **Conversations** to browse session logs the same way.

---

## Build from source

```powershell
git clone https://github.com/stillmvd/echo-studio.git
cd echo-studio
pnpm install
pnpm tauri build --no-bundle
```

The portable `Echo Studio.exe` ends up in `src-tauri/target/release/`.

### Stack

- [Tauri 2](https://tauri.app) (Rust + WebView2)
- [React 19](https://react.dev) + TypeScript 7 + [Vite 8](https://vite.dev)
- [Tailwind CSS 4](https://tailwindcss.com) with OKLCH design tokens
- [TanStack Query / Virtual](https://tanstack.com)
- [`notify`](https://docs.rs/notify) for config file watching
- [Biome 2](https://biomejs.dev) for linting and formatting
- [Lefthook](https://github.com/evilmartians/lefthook) pre-commit hooks (biome + tsc + cargo fmt + cargo clippy)

---

## Privacy

- 100% local. No telemetry, no analytics, no crash reports, no network calls.
- Strict content security policy; file reads from the UI are limited to the agent's config folders, known projects and plugin folders; session deletes to `~/.claude/projects`.
- Config writes happen only from the switches in Tools, touch one settings key at a time, and a backup is taken first.

---

## License

MIT — see [LICENSE](LICENSE).
