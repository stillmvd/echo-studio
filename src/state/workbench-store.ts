import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  CELL_COUNT,
  cellOfTab,
  cellShowing,
  closeTabInLayout,
  emptyCells,
  HANDS_ON_MS,
  insertTab,
  isLayout,
  moveTabInLayout,
  normalizeCells,
  normalizeLayout,
  type ProjectLayout,
  placeProject,
  pruneCells,
  renameTabInLayout,
  samePath,
  showTabInLayout,
  type WallCell,
  type WallLayout,
} from '@/lib/workbench';

export type { ProjectLayout, WallLayout };

export type WorkbenchView = { kind: 'overview' } | { kind: 'project'; path: string };
export type WorkbenchMode = 'project' | 'wall';

export const devTabKey = (path: string) => `dev:${path}`;
export const isDevTab = (key: string) => key.startsWith('dev:');

interface WorkbenchState {
  view: WorkbenchView;
  mode: WorkbenchMode;
  openGroups: string[];
  tabs: Record<string, string[]>;
  activeTab: Record<string, string>;
  recency: string[];
  seen: Record<string, number>;
  layout: WallLayout;
  cells: WallCell[];
  focusCell: string | null;
  hiddenProjects: string[];
  projectLayouts: Record<string, ProjectLayout>;
  autoTabs: string[];

  select: (view: WorkbenchView) => void;
  setMode: (mode: WorkbenchMode) => void;
  setProjectLayout: (path: string, layout: WallLayout) => void;
  moveTab: (path: string, key: string, toCell: number, index?: number) => void;
  moveTabToWallCell: (id: string, path: string, key: string, index?: number) => void;
  focusProjectCell: (path: string, index: number) => void;
  activateInCell: (path: string, cell: number, key: string) => void;
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
  if (id) return { cells: chooseInCell(s.cells, id, key), focusCell: s.focusCell };
  const placed = placeProject(s.cells, s.layout, s.focusCell, path);
  return { cells: chooseInCell(placed.cells, placed.focus, key), focusCell: placed.focus };
}

const NO_TABS: string[] = [];

type LayoutSource = Pick<WorkbenchState, 'projectLayouts' | 'tabs'>;

export function layoutOf(s: LayoutSource, path: string, tabs?: string[]): ProjectLayout {
  return normalizeLayout(s.projectLayouts[path], tabs ?? s.tabs[path] ?? NO_TABS);
}

export function useProjectLayout(path: string): ProjectLayout {
  const raw = useWorkbenchStore((s) => s.projectLayouts[path]);
  const tabs = useWorkbenchStore((s) => s.tabs[path]) ?? NO_TABS;
  return useMemo(() => normalizeLayout(raw, tabs), [raw, tabs]);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function migrateLayouts(
  raw: unknown,
  tabs: Record<string, string[]>,
  activeTab: Record<string, string>,
): Record<string, ProjectLayout> {
  const out: Record<string, ProjectLayout> = {};
  if (isObject(raw)) {
    for (const [path, l] of Object.entries(raw)) out[path] = normalizeLayout(l, tabs[path] ?? []);
    return out;
  }
  for (const [path, list] of Object.entries(tabs)) {
    if (list.length === 0) continue;
    out[path] = normalizeLayout(
      { layout: '1x1', focus: 0, cells: [{ tabs: list, active: activeTab[path] }] },
      list,
    );
  }
  return out;
}

export function migrateWorkbench(persisted: unknown): Partial<WorkbenchState> {
  const state = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<
    Omit<WorkbenchState, 'view'>
  > & { view?: unknown };
  const cells = normalizeCells(state.cells);
  const layout = isLayout(state.layout) ? state.layout : '1x1';
  const mode: WorkbenchMode = state.mode === 'wall' ? 'wall' : 'project';
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
  const projectLayouts = migrateLayouts(state.projectLayouts, tabs, activeTab);
  const raw = state.view as { kind?: unknown; path?: unknown } | undefined;
  const view: WorkbenchView =
    raw?.kind === 'project' && typeof raw.path === 'string'
      ? { kind: 'project', path: raw.path }
      : { kind: 'overview' };
  const focusCell =
    typeof state.focusCell === 'string' && cells.some((c) => c.id === state.focusCell)
      ? state.focusCell
      : null;
  const hiddenProjects = Array.isArray(state.hiddenProjects)
    ? state.hiddenProjects.filter((p): p is string => typeof p === 'string')
    : [];
  const base = {
    ...state,
    mode,
    tabs,
    activeTab,
    projectLayouts,
    layout,
    view,
    cells,
    focusCell,
    hiddenProjects,
    autoTabs: strings(state.autoTabs),
  };
  if (mode === 'wall' && view.kind === 'project' && !cells.some((c) => c.projectPath)) {
    const placed = placeProject(cells, layout, null, view.path);
    return { ...base, cells: placed.cells, focusCell: placed.focus };
  }
  return base;
}

const bump = (list: string[], key: string) => [key, ...list.filter((k) => k !== key)].slice(0, 50);

export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set) => ({
      view: { kind: 'overview' },
      openGroups: [],
      tabs: {},
      activeTab: {},
      recency: [],
      seen: {},
      layout: '1x1',
      cells: emptyCells(),
      focusCell: null,
      hiddenProjects: [],
      mode: 'project',
      projectLayouts: {},
      autoTabs: [],

      select: (view) =>
        set((s) => {
          if (view.kind !== 'project' || s.mode !== 'wall') return { view };
          const placed = placeProject(s.cells, s.layout, s.focusCell, view.path);
          return { view, cells: placed.cells, focusCell: placed.focus };
        }),
      setMode: (mode) =>
        set((s) => {
          if (mode !== 'wall' || s.view.kind !== 'project') return { mode };
          const placed = placeProject(s.cells, s.layout, s.focusCell, s.view.path);
          return { mode, cells: placed.cells, focusCell: placed.focus };
        }),
      setProjectLayout: (path, layout) =>
        set((s) => ({
          projectLayouts: {
            ...s.projectLayouts,
            [path]: normalizeLayout({ ...layoutOf(s, path), layout }, s.tabs[path] ?? NO_TABS),
          },
        })),
      moveTab: (path, key, toCell, index) =>
        set((s) => {
          const current = layoutOf(s, path);
          const next = moveTabInLayout(current, key, toCell, index);
          if (next === current) return {};
          return {
            projectLayouts: { ...s.projectLayouts, [path]: next },
            activeTab: { ...s.activeTab, [path]: key },
            recency: bump(s.recency, key),
          };
        }),
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
      focusProjectCell: (path, index) =>
        set((s) => {
          const current = layoutOf(s, path);
          if (index === current.focus || index >= CELL_COUNT[current.layout]) return {};
          return { projectLayouts: { ...s.projectLayouts, [path]: { ...current, focus: index } } };
        }),
      activateInCell: (path, cell, key) =>
        set((s) => {
          const current = layoutOf(s, path);
          if (!current.cells[cell]?.tabs.includes(key)) return {};
          return {
            projectLayouts: { ...s.projectLayouts, [path]: showTabInLayout(current, key) },
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
          const tabs = list.includes(key) ? list : [...list, key];
          const placed = layoutOf(s, path, tabs);
          return {
            tabs: { ...s.tabs, [path]: tabs },
            autoTabs: s.autoTabs.filter((k) => k !== key),
            activeTab: { ...s.activeTab, [path]: key },
            recency: bump(s.recency, key),
            ...(s.mode === 'wall' ? showInCell(s, path, key) : {}),
            projectLayouts: {
              ...s.projectLayouts,
              [path]: s.mode === 'project' ? showTabInLayout(placed, key) : placed,
            },
          };
        }),
      closeTab: (path, key) =>
        set((s) => {
          const list = (s.tabs[path] ?? []).filter((k) => k !== key);
          const before = layoutOf(s, path);
          const from = cellOfTab(before, key);
          const placed = closeTabInLayout(before, key, list);
          const activeTab = { ...s.activeTab };
          if (activeTab[path] === key) {
            const next =
              s.mode === 'project'
                ? (placed.cells[from]?.active ??
                  placed.cells[placed.focus]?.active ??
                  list[list.length - 1])
                : list[list.length - 1];
            if (next) activeTab[path] = next;
            else delete activeTab[path];
          }
          return {
            tabs: { ...s.tabs, [path]: list },
            autoTabs: s.autoTabs.filter((k) => k !== key),
            projectLayouts: { ...s.projectLayouts, [path]: placed },
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
          const tabs = list.map(swap);
          return {
            tabs: { ...s.tabs, [path]: tabs },
            projectLayouts: {
              ...s.projectLayouts,
              [path]: normalizeLayout(renameTabInLayout(layoutOf(s, path), from, to), tabs),
            },
            activeTab: s.activeTab[path] === from ? { ...s.activeTab, [path]: to } : s.activeTab,
            recency: s.recency.map(swap),
            autoTabs: s.autoTabs.map(swap),
            cells: s.cells.map((c) => (c.activeTab === from ? { ...c, activeTab: to } : c)),
          };
        }),
      activate: (path, key) =>
        set((s) => {
          const base = {
            activeTab: { ...s.activeTab, [path]: key },
            recency: bump(s.recency, key),
            autoTabs: s.autoTabs.filter((k) => k !== key),
          };
          if (s.mode === 'wall') return { ...base, ...showInCell(s, path, key) };
          return {
            ...base,
            projectLayouts: {
              ...s.projectLayouts,
              [path]: showTabInLayout(layoutOf(s, path), key),
            },
          };
        }),
      markSeen: (sessionId) => set((s) => ({ seen: { ...s.seen, [sessionId]: Date.now() } })),
      setLayout: (layout) =>
        set((s) => {
          if (s.view.kind !== 'project') return { layout };
          const placed = placeProject(s.cells, layout, s.focusCell, s.view.path);
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
            activeTab: path ? { ...s.activeTab, [path]: key } : s.activeTab,
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
      version: 3,
      migrate: (persisted) => migrateWorkbench(persisted) as WorkbenchState,
      merge: (persisted, current) => ({
        ...current,
        ...migrateWorkbench(persisted),
        openGroups: [],
      }),
      partialize: (s) => ({
        view: s.view,
        mode: s.mode,
        projectLayouts: s.projectLayouts,
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
