# Phase 2 — Memories UI Shell

## Goal

3-pane layout для вкладки Memories: sidebar (projects + categories) → virtualized list → detail pane с markdown-render. Drag-resize между панелями с persist в `localStorage`. Selection state в zustand-сторе. Tab-навигация наверху (Memories активна, Conversations и Settings — placeholder'ы).

## Definition of Done

- [ ] 3 panes drag-resizable через `react-resizable-panels`
- [ ] Sidebar: список проектов с counters, кликабелен (хайлайт активного), категории + status-toggle (active/archived/all)
- [ ] Список memories виртуализирован (`@tanstack/react-virtual`), скроллится плавно при 200+ items
- [ ] Selection persistent в zustand: `selectedMemoryId`, `selectedProject`, `selectedCategory`, `status`
- [ ] Detail pane: header (title, project, category, tags, dates), body markdown через `react-markdown` + `remark-gfm` + `rehype-highlight`, toggle Rendered ⟷ Raw
- [ ] Tab-bar наверху (Memories / Conversations / Settings), Conversations и Settings — заглушки
- [ ] Layout sizes сохраняются в `localStorage` после drag-resize
- [ ] Все pre-commit-проверки зелёные

## Закрывает требования

- **FR-MEM-03** Detail view с head fields + size + markdown body (rendered + raw toggle)
- **FR-COM-05** Drag-resize panes с persist

## Tasks

### T-2.1 — Frontend deps

```
zustand
@tanstack/react-virtual
react-resizable-panels
react-markdown remark-gfm rehype-highlight highlight.js
@radix-ui/react-tabs @radix-ui/react-scroll-area @radix-ui/react-tooltip
clsx tailwind-merge          # для cn() helper
lucide-react                 # icons
```

### T-2.2 — Helpers (`src/lib/cn.ts`)

```ts
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

### T-2.3 — UI store (`src/state/ui-store.ts`)

```ts
interface UiState {
  activeTab: 'memories' | 'conversations' | 'settings';
  selectedProject: string | null;
  selectedCategory: string | null;
  status: 'active' | 'archived' | 'all';
  selectedMemoryId: string | null;
  detailMode: 'rendered' | 'raw';
  // actions: setActiveTab, setSelectedProject, ...
}
```

`zustand/middleware/persist` для запоминания selection между сессиями (исключая selectedMemoryId — он сбрасывается).

### T-2.4 — Layout (`src/components/layout/`)

```
AppShell.tsx        — корневой, держит TabBar + рендерит активный таб
TabBar.tsx          — горизонтальная навигация
MemoriesLayout.tsx  — 3 panel'а через react-resizable-panels
```

`localStorage` ключ для panel sizes: `echo-studio.memories.panel-sizes`.

### T-2.5 — Memories panes (`src/components/memories/`)

```
ProjectSidebar.tsx  — projects + categories + status-toggle
MemoryList.tsx      — виртуализированный список с TanStack Virtual
MemoryDetail.tsx    — header + body + Rendered/Raw toggle
MemoryRow.tsx       — одна строка списка (title, project, category, tags, дата, размер)
EmptyDetail.tsx     — placeholder когда memory не выбрана
```

### T-2.6 — Markdown renderer (`src/components/markdown/Markdown.tsx`)

```ts
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
  components={{...overrides for color/spacing...}}
>
  {body}
</ReactMarkdown>
```

Подключить `highlight.js` тему в `globals.css` через `@import` (тёмная: `github-dark` или подобная).

### T-2.7 — App.tsx → AppShell

Перенести логику отображения в `AppShell`, оставить `App.tsx` тонким bootstrap'ом.

### T-2.8 — Smoke checks + commit

`pnpm typecheck/biome/build` + `cargo` зелёные → commit `feat(02): memories ui shell — 3 panes, virtualized list, markdown detail`.

## Не делаем в Phase 2

- ❌ Filter chips (date range, tags) — Phase 3
- ❌ Search FTS5/semantic — Phase 3
- ❌ Sort customization — Phase 3
- ❌ «Open in Claude Code» — Phase 5
- ❌ Edit/Archive/Delete actions — Phase 4-5
- ❌ Conversations tab (полноценный) — Phase 7-8
- ❌ shadcn-cli init: возьмём только Radix-примитивы напрямую, чтобы не тащить весь boilerplate
