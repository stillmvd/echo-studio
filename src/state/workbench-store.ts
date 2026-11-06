import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  activateInGrid,
  adoptInGrid,
  closeInGrid,
  type Edge,
  emptyGrid,
  focusedKey,
  gridFromTabs,
  gridTabs,
  moveInGrid,
  normalizeGrid,
  openInGrid,
  type ProjectGrid,
  paneOf,
  placeAside,
  renameInGrid,
  resizeGrid,
  splitGrid,
} from '@/lib/project-grid';
import {
  CELL_COUNT,
  emptyCells,
  HANDS_ON_MS,
  isLayout,
  keepOnShrink,
  normalizeCells,
  pruneCells,
  samePath,
  type WallCell,
  type WallLayout,
} from '@/lib/workbench';

export type { WallLayout };

export type WorkbenchView = { kind: 'overview' } | { kind: 'project'; path: string };

export const devTabKey = (path: string) => `dev:${path}`;
export const isDevTab = (key: string) => key.startsWith('dev:');

interface WorkbenchState {
  view: WorkbenchView;
  auto: boolean;
  openGroups: string[];
  grids: Record<string, ProjectGrid>;
  tabs: Record<string, string[]>;
  activeTab: Record<string, string>;
  recency: string[];
  seen: Record<string, number>;
  layout: WallLayout;
  cells: WallCell[];
  focusCell: string | null;
  hiddenProjects: string[];
  autoTabs: string[];

  select: (view: WorkbenchView) => void;
  setAuto: (auto: boolean) => void;
  moveTabToWallCell: (id: string, path: string, key: string, index?: number) => void;
  toggleGroup: (name: string) => void;
  collapseGroups: () => void;
  openTab: (path: string, key: string) => void;
  openAside: (path: string, key: string, focus: boolean) => void;
  adoptTabs: (entries: { path: string; key: string }[]) => void;
  closeTab: (path: string, key: string) => void;
  renameTab: (path: string, from: string, to: string) => void;
  activate: (path: string, key: string) => void;
  activatePane: (path: string, pane: number, key: string) => void;
  focusPane: (path: string, pane: number, key?: string) => void;
  moveTab: (path: string, key: string, pane: number, index?: number) => void;
  splitTab: (path: string, key: string, pane: number, edge: Edge) => void;
  setGridLayout: (path: string, layout: WallLayout) => void;
  markSeen: (sessionId: string) => void;
  setLayout: (layout: WallLayout) => void;
  setCells: (cells: WallCell[]) => void;
  pinCell: (id: string) => void;
  touchCell: (id: string, key?: string) => void;
  activateCell: (id: string, key: string) => void;
  pruneCells: (exists: (path: string) => boolean) => void;
  hideProject: (path: string) => void;
  unhideProject: (path: string) => void;
}

type Derived = Pick<WorkbenchState, 'grids' | 'tabs' | 'activeTab'>;

function derive(grids: Record<string, ProjectGrid>): Derived {
  const tabs: Record<string, string[]> = {};
  const activeTab: Record<string, string> = {};
  for (const [path, g] of Object.entries(grids)) {
    tabs[path] = gridTabs(g);
    const key = focusedKey(g) ?? g.panes.find((p) => p.active)?.active;
    if (key) activeTab[path] = key;
  }
  return { grids, tabs, activeTab };
}

function put(s: Derived, path: string, grid: ProjectGrid): Derived {
  if (s.grids[path] === grid) return s;
  const tabs = { ...s.tabs, [path]: gridTabs(grid) };
  const activeTab = { ...s.activeTab };
  const key = focusedKey(grid) ?? grid.panes.find((p) => p.active)?.active;
  if (key) activeTab[path] = key;
  else delete activeTab[path];
  return { grids: { ...s.grids, [path]: grid }, tabs, activeTab };
}

const gridOf = (s: Derived, path: string) => s.grids[path] ?? emptyGrid();

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

interface LegacyProjectLayout {
  layout?: unknown;
  cells?: { tabs?: unknown; active?: unknown }[];
}

function fromProjectLayout(raw: unknown, tabs: string[]): ProjectGrid | null {
  if (!isObject(raw)) return null;
  const src = raw as LegacyProjectLayout;
  const layout = isLayout(src.layout) ? src.layout : '1x1';
  const list = Array.isArray(src.cells) ? src.cells : [];
  const used = new Set<string>();
  const panes = Array.from({ length: CELL_COUNT[layout] }, (_, i) => {
    const own = strings(list[i]?.tabs).filter((k) => tabs.includes(k) && !used.has(k));
    for (const k of own) used.add(k);
    const active = typeof list[i]?.active === 'string' ? (list[i]?.active as string) : undefined;
    const pick = active && own.includes(active) ? active : own[own.length - 1];
    return pick ? { tabs: own, active: pick } : { tabs: own };
  });
  const rest = tabs.filter((k) => !used.has(k));
  if (rest.length) panes[0]?.tabs.push(...rest);
  return normalizeGrid({ layout, panes, focus: 0 });
}

export function migrateWorkbench(persisted: unknown): Partial<WorkbenchState> {
  const state = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<
    Omit<WorkbenchState, 'view' | 'grids'>
  > & { view?: unknown; mode?: unknown; projectLayouts?: unknown; grids?: unknown };
  const tabs: Record<string, string[]> = {};
  if (isObject(state.tabs)) {
    for (const [path, list] of Object.entries(state.tabs)) tabs[path] = strings(list);
  }
  const activeTab: Record<string, string> = {};
  if (isObject(state.activeTab)) {
    for (const [path, key] of Object.entries(state.activeTab)) {
      if (typeof key === 'string') activeTab[path] = key;
    }
  }
  const raw = state.view as { kind?: unknown; path?: unknown } | undefined;
  const view: WorkbenchView =
    raw?.kind === 'project' && typeof raw.path === 'string'
      ? { kind: 'project', path: raw.path }
      : { kind: 'overview' };
  const legacy = 'mode' in state;
  const auto = typeof state.auto === 'boolean' ? state.auto : state.mode === 'wall';
  const layout: WallLayout = isLayout(state.layout) ? state.layout : '1x1';
  const oldCells = normalizeCells(state.cells);
  const grids: Record<string, ProjectGrid> = {};
  if (isObject(state.grids)) {
    for (const [path, g] of Object.entries(state.grids)) {
      const grid = normalizeGrid(g);
      if (grid) grids[path] = grid;
    }
  } else {
    const layouts = legacy && isObject(state.projectLayouts) ? state.projectLayouts : {};
    const shown = oldCells.slice(0, CELL_COUNT[layout]);
    for (const [path, list] of Object.entries(tabs)) {
      const fromLegacy = fromProjectLayout(layouts[path], list);
      if (fromLegacy) {
        grids[path] = fromLegacy;
        continue;
      }
      const actives = legacy
        ? []
        : shown.flatMap((c) =>
            c.projectPath && samePath(c.projectPath, path) && c.activeTab ? [c.activeTab] : [],
          );
      const own = activeTab[path];
      grids[path] = gridFromTabs(list, actives.length > 1 ? actives : own ? [own] : []);
    }
  }
  const migrated = !isObject(state.grids);
  const cells = migrated
    ? oldCells.map((c) => (c.pinned ? c : { ...c, manual: false, activeTab: undefined }))
    : oldCells;
  const focusCell =
    typeof state.focusCell === 'string' &&
    cells.slice(0, CELL_COUNT[layout]).some((c) => c.id === state.focusCell)
      ? state.focusCell
      : (cells[0]?.id ?? null);
  const {
    mode: _mode,
    projectLayouts: _layouts,
    grids: _grids,
    tabs: _tabs,
    activeTab: _active,
    ...rest
  } = state;
  return {
    ...rest,
    ...derive(grids),
    auto,
    layout,
    view,
    cells,
    focusCell,
    hiddenProjects: strings(state.hiddenProjects),
    autoTabs: strings(state.autoTabs),
  };
}

const bump = (list: string[], key: string) => [key, ...list.filter((k) => k !== key)].slice(0, 50);

export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set) => ({
      view: { kind: 'overview' },
      auto: false,
      openGroups: [],
      grids: {},
      tabs: {},
      activeTab: {},
      recency: [],
      seen: {},
      layout: '1x1',
      cells: emptyCells(),
      focusCell: 'c1',
      hiddenProjects: [],
      autoTabs: [],

      select: (view) => set(view.kind === 'project' ? { view, auto: false } : { view }),
      setAuto: (auto) => set({ auto }),
      moveTabToWallCell: (id, path, key) =>
        set((s) => {
          const target = s.cells.find((c) => c.id === id);
          if (!target || !(s.tabs[path] ?? []).includes(key)) return {};
          return {
            cells: s.cells.map((c) =>
              c.id === id
                ? { ...c, projectPath: path, manual: !c.pinned, activeTab: key }
                : c.activeTab === key
                  ? { ...c, activeTab: undefined }
                  : c,
            ),
            focusCell: id,
            view: { kind: 'project', path },
            recency: bump(s.recency, key),
          };
        }),
      toggleGroup: (name) =>
        set((s) => ({
          openGroups: s.openGroups.includes(name)
            ? s.openGroups.filter((g) => g !== name)
            : [...s.openGroups, name],
        })),
      collapseGroups: () => set({ openGroups: [] }),
      openTab: (path, key) =>
        set((s) => ({
          ...put(s, path, openInGrid(gridOf(s, path), key)),
          autoTabs: s.autoTabs.filter((k) => k !== key),
          recency: bump(s.recency, key),
        })),
      openAside: (path, key, focus) =>
        set((s) => ({
          ...put(s, path, placeAside(gridOf(s, path), key, focus)),
          autoTabs: s.autoTabs.filter((k) => k !== key),
          recency: bump(s.recency, key),
        })),
      adoptTabs: (entries) =>
        set((s) => {
          let next: Derived = s;
          const autoTabs = [...s.autoTabs];
          for (const { path, key } of entries) {
            const grid = gridOf(next, path);
            if (paneOf(grid, key) >= 0) continue;
            next = put(next, path, adoptInGrid(grid, key));
            if (!autoTabs.includes(key)) autoTabs.push(key);
          }
          return next === s ? {} : { ...next, autoTabs };
        }),
      closeTab: (path, key) =>
        set((s) => ({
          ...put(s, path, closeInGrid(gridOf(s, path), key)),
          autoTabs: s.autoTabs.filter((k) => k !== key),
          recency: s.recency.filter((k) => k !== key),
          cells: s.cells.some((c) => c.activeTab === key)
            ? s.cells.map((c) => (c.activeTab === key ? { ...c, activeTab: undefined } : c))
            : s.cells,
        })),
      renameTab: (path, from, to) =>
        set((s) => {
          const list = s.tabs[path] ?? [];
          if (!list.includes(from) || list.includes(to)) return {};
          const swap = (k: string) => (k === from ? to : k);
          return {
            ...put(s, path, renameInGrid(gridOf(s, path), from, to)),
            recency: s.recency.map(swap),
            autoTabs: s.autoTabs.map(swap),
            cells: s.cells.map((c) => (c.activeTab === from ? { ...c, activeTab: to } : c)),
          };
        }),
      activate: (path, key) =>
        set((s) => ({
          ...put(s, path, openInGrid(gridOf(s, path), key)),
          recency: bump(s.recency, key),
          autoTabs: s.autoTabs.filter((k) => k !== key),
        })),
      activatePane: (path, pane, key) =>
        set((s) => {
          const grid = gridOf(s, path);
          const next = activateInGrid(grid, pane, key);
          if (next === grid && s.recency[0] === key) return s;
          return {
            ...put(s, path, next),
            recency: bump(s.recency, key),
            autoTabs: s.autoTabs.filter((k) => k !== key),
          };
        }),
      focusPane: (path, pane, key) =>
        set((s) => {
          const grid = gridOf(s, path);
          const now = Date.now();
          const seen = key && !isDevTab(key) ? { ...s.seen, [key]: now } : s.seen;
          const autoTabs = key ? s.autoTabs.filter((k) => k !== key) : s.autoTabs;
          if (grid.focus === pane || !grid.panes[pane]) {
            return key && !isDevTab(key) && now - (s.seen[key] ?? 0) > HANDS_ON_MS
              ? { seen, autoTabs }
              : s;
          }
          return { ...put(s, path, { ...grid, focus: pane }), seen, autoTabs };
        }),
      moveTab: (path, key, pane, index) =>
        set((s) => ({
          ...put(s, path, moveInGrid(gridOf(s, path), key, pane, index)),
          recency: bump(s.recency, key),
        })),
      splitTab: (path, key, pane, edge) =>
        set((s) => {
          const next = splitGrid(gridOf(s, path), key, pane, edge);
          return next ? { ...put(s, path, next), recency: bump(s.recency, key) } : {};
        }),
      setGridLayout: (path, layout) =>
        set((s) => put(s, path, resizeGrid(gridOf(s, path), layout))),
      markSeen: (sessionId) => set((s) => ({ seen: { ...s.seen, [sessionId]: Date.now() } })),
      setLayout: (layout) =>
        set((s) => {
          const { cells, focus } = keepOnShrink(s.cells, CELL_COUNT[layout], s.focusCell);
          return { layout, cells, focusCell: focus };
        }),
      setCells: (cells) => set({ cells }),
      pinCell: (id) =>
        set((s) => ({
          cells: s.cells.map((c) => {
            if (c.id !== id) return c;
            const locked = c.pinned || c.manual;
            return { ...c, pinned: !locked, manual: false };
          }),
        })),
      activateCell: (id, key) =>
        set((s) => {
          const path = s.cells.find((c) => c.id === id)?.projectPath;
          if (!path || !(s.tabs[path] ?? []).includes(key)) return {};
          return {
            cells: s.cells.map((c) =>
              c.id === id
                ? { ...c, activeTab: key }
                : c.activeTab === key
                  ? { ...c, activeTab: undefined }
                  : c,
            ),
            recency: bump(s.recency, key),
          };
        }),
      touchCell: (id, key) =>
        set((s) => {
          const cell = s.cells.find((c) => c.id === id);
          if (!cell) return {};
          const now = Date.now();
          const fresh = now - cell.lastInputAt < HANDS_ON_MS / 3;
          if (fresh && s.focusCell === id) return {};
          return {
            focusCell: id,
            view: cell.projectPath ? { kind: 'project', path: cell.projectPath } : s.view,
            seen: key && !isDevTab(key) ? { ...s.seen, [key]: now } : s.seen,
            autoTabs: key ? s.autoTabs.filter((k) => k !== key) : s.autoTabs,
            cells: fresh
              ? s.cells
              : s.cells.map((c) => (c.id === id ? { ...c, lastInputAt: now } : c)),
          };
        }),
      pruneCells: (exists) =>
        set((s) => {
          const cells = pruneCells(s.cells, exists);
          return cells === s.cells ? {} : { cells };
        }),
      hideProject: (path) =>
        set((s) =>
          s.hiddenProjects.some((p) => samePath(p, path))
            ? {}
            : { hiddenProjects: [...s.hiddenProjects, path] },
        ),
      unhideProject: (path) =>
        set((s) => ({ hiddenProjects: s.hiddenProjects.filter((p) => !samePath(p, path)) })),
    }),
    {
      name: 'echo-workbench',
      version: 5,
      migrate: (persisted) => migrateWorkbench(persisted) as WorkbenchState,
      merge: (persisted, current) => ({
        ...current,
        ...migrateWorkbench(persisted),
        openGroups: [],
      }),
      partialize: (s) => ({
        view: s.view,
        auto: s.auto,
        grids: s.grids,
        recency: s.recency,
        seen: s.seen,
        layout: s.layout,
        cells: s.cells,
        focusCell: s.focusCell,
        hiddenProjects: s.hiddenProjects,
        autoTabs: s.autoTabs,
      }),
    },
  ),
);

export function currentKey(s: WorkbenchState): string | undefined {
  if (s.view.kind !== 'project') return undefined;
  const grid = s.grids[s.view.path];
  return grid ? focusedKey(grid) : undefined;
}
