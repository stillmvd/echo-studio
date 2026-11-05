import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CELL_COUNT,
  cellShowing,
  emptyCells,
  HANDS_ON_MS,
  insertTab,
  isLayout,
  keepOnShrink,
  normalizeCells,
  placeProject,
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
  closeTab: (path: string, key: string) => void;
  renameTab: (path: string, from: string, to: string) => void;
  activate: (path: string, key: string) => void;
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

const chooseInCell = (cells: WallCell[], id: string, key: string): WallCell[] =>
  cells.map((c) =>
    c.id === id
      ? { ...c, activeTab: key, manual: !c.pinned }
      : c.activeTab === key
        ? { ...c, activeTab: undefined }
        : c,
  );

function showInCell(
  s: WorkbenchState,
  path: string,
  key: string,
): Pick<WorkbenchState, 'cells' | 'focusCell'> {
  const id = cellShowing(s.cells, s.layout, s.focusCell, path);
  if (id) return { cells: chooseInCell(s.cells, id, key), focusCell: id };
  const placed = placeProject(s.cells, s.layout, s.focusCell, path, s.auto);
  return { cells: chooseInCell(placed.cells, placed.focus, key), focusCell: placed.focus };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

interface LegacyProjectLayout {
  layout?: unknown;
  cells?: { tabs?: unknown; active?: unknown }[];
}

function fromProjectLayout(
  raw: unknown,
  path: string,
  tabs: string[],
): { layout: WallLayout; cells: WallCell[] } {
  const src = (isObject(raw) ? raw : {}) as LegacyProjectLayout;
  const layout = isLayout(src.layout) ? src.layout : '1x1';
  const count = CELL_COUNT[layout];
  const list = Array.isArray(src.cells) ? src.cells : [];
  const cells = emptyCells().map((c, i) => {
    if (i >= count) return c;
    const own = strings(list[i]?.tabs).filter((k) => tabs.includes(k));
    if (i > 0 && own.length === 0) return c;
    const active = typeof list[i]?.active === 'string' ? (list[i]?.active as string) : undefined;
    return {
      ...c,
      projectPath: path,
      manual: true,
      activeTab: active && own.includes(active) ? active : own[own.length - 1],
    };
  });
  return { layout, cells };
}

export function migrateWorkbench(persisted: unknown): Partial<WorkbenchState> {
  const state = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<
    Omit<WorkbenchState, 'view'>
  > & { view?: unknown; mode?: unknown; projectLayouts?: unknown };
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
  let cells = normalizeCells(state.cells);
  let layout: WallLayout = isLayout(state.layout) ? state.layout : '1x1';
  if (legacy && state.mode !== 'wall' && view.kind === 'project') {
    const layouts = isObject(state.projectLayouts) ? state.projectLayouts : {};
    const own = fromProjectLayout(layouts[view.path], view.path, tabs[view.path] ?? []);
    const count = CELL_COUNT[own.layout];
    const next = own.cells;
    for (const pinned of cells.filter((c) => c.pinned && c.projectPath)) {
      if (next.some((c) => c.projectPath && samePath(c.projectPath, pinned.projectPath ?? ''))) {
        continue;
      }
      const free = next.findIndex((c, i) => i < count && c.projectPath === null);
      const slot = free >= 0 ? free : next.findIndex((c, i) => i >= count && !c.projectPath);
      const at = next[slot];
      if (at) next[slot] = { ...pinned, id: at.id };
    }
    cells = next;
    layout = own.layout;
  }
  const focusCell =
    typeof state.focusCell === 'string' &&
    cells.slice(0, CELL_COUNT[layout]).some((c) => c.id === state.focusCell)
      ? state.focusCell
      : null;
  const hiddenProjects = strings(state.hiddenProjects);
  const { mode: _mode, projectLayouts: _layouts, ...rest } = state;
  const base = {
    ...rest,
    auto,
    tabs,
    activeTab,
    layout,
    view,
    cells,
    focusCell,
    hiddenProjects,
    autoTabs: strings(state.autoTabs),
  };
  const shown = cells.slice(0, CELL_COUNT[layout]);
  if (view.kind === 'project' && !shown.some((c) => c.projectPath)) {
    const placed = placeProject(cells, layout, focusCell, view.path, auto);
    return { ...base, cells: placed.cells, focusCell: placed.focus };
  }
  if (!focusCell) {
    const first = shown.find((c) => c.projectPath) ?? shown[0];
    return { ...base, focusCell: first?.id ?? null };
  }
  return base;
}

const bump = (list: string[], key: string) => [key, ...list.filter((k) => k !== key)].slice(0, 50);

export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set) => ({
      view: { kind: 'overview' },
      auto: false,
      openGroups: [],
      tabs: {},
      activeTab: {},
      recency: [],
      seen: {},
      layout: '1x1',
      cells: emptyCells(),
      focusCell: null,
      hiddenProjects: [],
      autoTabs: [],

      select: (view) =>
        set((s) => {
          if (view.kind !== 'project') return { view };
          const placed = placeProject(s.cells, s.layout, s.focusCell, view.path, s.auto);
          return { view, cells: placed.cells, focusCell: placed.focus };
        }),
      setAuto: (auto) => set({ auto }),
      moveTabToWallCell: (id, path, key, index) =>
        set((s) => {
          const list = s.tabs[path] ?? [];
          const target = s.cells.find((c) => c.id === id);
          if (!target || !list.includes(key)) return {};
          const same = target.projectPath !== null && samePath(target.projectPath, path);
          return {
            tabs: index === undefined ? s.tabs : { ...s.tabs, [path]: insertTab(list, key, index) },
            cells: s.cells.map((c) =>
              c.id === id
                ? { ...c, projectPath: path, manual: same ? c.manual : !c.pinned, activeTab: key }
                : c.activeTab === key
                  ? { ...c, activeTab: undefined }
                  : c,
            ),
            focusCell: id,
            view: { kind: 'project', path },
            activeTab: { ...s.activeTab, [path]: key },
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
        set((s) => {
          const list = s.tabs[path] ?? [];
          return {
            tabs: { ...s.tabs, [path]: list.includes(key) ? list : [...list, key] },
            autoTabs: s.autoTabs.filter((k) => k !== key),
            activeTab: { ...s.activeTab, [path]: key },
            recency: bump(s.recency, key),
            ...showInCell(s, path, key),
          };
        }),
      closeTab: (path, key) =>
        set((s) => {
          const list = (s.tabs[path] ?? []).filter((k) => k !== key);
          const activeTab = { ...s.activeTab };
          if (activeTab[path] === key) {
            const next = list[list.length - 1];
            if (next) activeTab[path] = next;
            else delete activeTab[path];
          }
          return {
            tabs: { ...s.tabs, [path]: list },
            autoTabs: s.autoTabs.filter((k) => k !== key),
            activeTab,
            recency: s.recency.filter((k) => k !== key),
            cells: s.cells.some((c) => c.activeTab === key)
              ? s.cells.map((c) => (c.activeTab === key ? { ...c, activeTab: undefined } : c))
              : s.cells,
          };
        }),
      renameTab: (path, from, to) =>
        set((s) => {
          const list = s.tabs[path] ?? [];
          if (!list.includes(from) || list.includes(to)) return {};
          const swap = (k: string) => (k === from ? to : k);
          return {
            tabs: { ...s.tabs, [path]: list.map(swap) },
            activeTab: s.activeTab[path] === from ? { ...s.activeTab, [path]: to } : s.activeTab,
            recency: s.recency.map(swap),
            autoTabs: s.autoTabs.map(swap),
            cells: s.cells.map((c) => (c.activeTab === from ? { ...c, activeTab: to } : c)),
          };
        }),
      activate: (path, key) =>
        set((s) => ({
          activeTab: { ...s.activeTab, [path]: key },
          recency: bump(s.recency, key),
          autoTabs: s.autoTabs.filter((k) => k !== key),
          ...showInCell(s, path, key),
        })),
      markSeen: (sessionId) => set((s) => ({ seen: { ...s.seen, [sessionId]: Date.now() } })),
      setLayout: (layout) =>
        set((s) => {
          const { cells, focus } = keepOnShrink(s.cells, CELL_COUNT[layout], s.focusCell);
          if (s.view.kind !== 'project') return { layout, cells, focusCell: focus };
          const placed = placeProject(cells, layout, focus, s.view.path, s.auto);
          return { layout, cells: placed.cells, focusCell: placed.focus };
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
            cells: chooseInCell(s.cells, id, key),
            activeTab: { ...s.activeTab, [path]: key },
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
      version: 4,
      migrate: (persisted) => migrateWorkbench(persisted) as WorkbenchState,
      merge: (persisted, current) => ({
        ...current,
        ...migrateWorkbench(persisted),
        openGroups: [],
      }),
      partialize: (s) => ({
        view: s.view,
        auto: s.auto,
        tabs: s.tabs,
        activeTab: s.activeTab,
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
