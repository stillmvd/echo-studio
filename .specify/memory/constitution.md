<!--
Sync Impact Report
- Version: template → 1.0.0 (first ratification)
- Principles added: I. Claude config belongs to the user; II. Guarded file access; III. Resilient reading;
  IV. Responsive desktop; V. Local and private; VI. Simplicity and the Trail language
- Sections added: Technology Constraints, Development Workflow, Governance
- Templates: plan/spec/tasks templates read this file at runtime — no edits required
- Deferred: none
-->

# Echo Studio Constitution

## Core Principles

### I. Claude config belongs to the user

Echo Studio reads Claude Code configuration (`~/.claude`, `~/.claude.json`, project `.claude/` and
`.mcp.json`) and treats it as the user's property.

- Reading is the default. Writing happens only on an explicit user action (a toggle, a delete with
  confirmation), never as a side effect of browsing or scanning.
- Every write first saves a timestamped copy of the file it changes, and is atomic: write a temp file
  next to the target, then rename. A failed write leaves the original untouched.
- A write changes only the keys the action owns. Unknown keys, their order and values are preserved.
- The app never creates, rewrites or "normalizes" config files it was not asked to change.

### II. Guarded file access

- Every IPC command that touches the file system validates its path against an allow-list of roots
  (Claude config dirs, known project dirs, `~/.claude/projects`) and file kinds before any I/O.
- The webview CSP is never weakened to `null`. External links open only through the shell plugin;
  webview navigation away from the app is blocked.

### III. Resilient reading

- A malformed file (JSON, YAML front matter, JSONL line) degrades only its own entry: the entry is
  shown with an error marker, the rest of the list still loads.
- Missing directories and files are a normal state, not an error.

### IV. Responsive desktop

- Blocking file I/O inside async commands runs in `spawn_blocking`.
- Large scans and file watching never freeze the UI; lists render virtualized when they can exceed a
  few hundred rows.

### V. Local and private

- No network calls except ones the user explicitly triggers. No telemetry without an opt-in flag.
- Secrets seen in config (env values, tokens, headers of MCP servers) are masked in the UI by default.

### VI. Simplicity and the Trail language

- YAGNI: no abstraction with one implementation, no option nobody asked for. Deletion over addition.
- UI follows the Trail plastic chosen in `.planning/REDESIGN-TRAIL.md`; a new screen's form is picked
  on a stand before it is built.

## Technology Constraints

- Tauri 2 (Rust, `thiserror` + `anyhow` at the IPC boundary), React 19, TypeScript strict with
  `noUncheckedIndexedAccess`, Tailwind 4 tokens in `src/styles/tokens.css`, TanStack Query, zustand.
- Windows-only portable build is the target.
- No comments in code except TODO.

## Development Workflow

- Quality gates before a change is done: `pnpm biome check .`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`; with Rust changes also `cargo clippy --all-targets -- -D warnings` and `cargo test`.
- Pure logic (parsers, merge of global/project/plugin scopes, path guards) ships with unit tests.
- Commits: conventional format, no mention of AI tools in messages or trailers.

## Governance

This constitution overrides conflicting habits in specs and plans. Amendments are made through
`/speckit-constitution`, bump the version (MAJOR for removed or redefined principles, MINOR for new
ones, PATCH for wording) and record the change in the Sync Impact Report. Plans must include a
Constitution Check against these principles; any violation needs a written justification.

**Version**: 1.0.0 | **Ratified**: 2026-09-26 | **Last Amended**: 2026-09-26
