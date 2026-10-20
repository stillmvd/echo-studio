import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  assignTabs,
  CELL_COUNT,
  cellShowing,
  emptyCells,
  HANDS_ON_MS,
  normalizeCells,
  placeProject,
  pruneCells,
  type WallCell,
  type WallLayout,
} from '@/lib/workbench';

export type { WallLayout };

export type WorkbenchView = { kind: 'overview' } | { kind: 'project'; path: string };

export const devTabKey = (path: string) => `dev:${path}`;
export const isDevTab = (key: string) => key.startsWith('dev:');

interface WorkbenchState {
  view: WorkbenchView;
  openGroups: string[];
  tabs: Record<string, string[]>;
  activeTab: Record<string, string>;
  recency: string[];
  seen: Record<string, number>;
  layout: WallLayout;
  cells: WallCell[];
  focusCell: string | null;

  select: (view: WorkbenchView) => void;
  toggleGroup: (name: string) => void;
  openTab: (path: string, key: string) => void;
  closeTab: (path: string, key: string) => void;
  activate: (path: string, key: string) => void;
  markSeen: (sessionId: string) => void;
  setLayout: (layout: WallLayout) => void;
  setCells: (cells: WallCell[]) => void;
  pinCell: (id: string) => void;
  touchCell: (id: string) => void;
  activateCell: (id: string, key: string) => void;
  pruneCells: (exists: (path: string) => boolean) => void;
}

function showInCell(s: WorkbenchState, path: string, key: string): WallCell[] {
  const id = cellShowing(s.cells, s.layout, s.focusCell, path);
  if (!id) return s.cells;
  return s.cells.map((c) =>
    c.id === id
      ? { ...c, activeTab: key }
      : c.activeTab === key
        ? { ...c, activeTab: undefined }
        : c,
  );
}

export function migrateWorkbench(persisted: unknown): Partial<WorkbenchState> {
  const state = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<
    Omit<WorkbenchState, 'view'>
  > & { view?: unknown };
  const cells = normalizeCells(state.cells);
  const layout = state.layout && state.layout in CELL_COUNT ? state.layout : '1x1';
  const raw = state.view as { kind?: unknown; path?: unknown } | undefined;
  const view: WorkbenchView =
    raw?.kind === 'project' && typeof raw.path === 'string'
      ? { kind: 'project', path: raw.path }
      : { kind: 'overview' };
  const focusCell =
    typeof state.focusCell === 'string' && cells.some((c) => c.id === state.focusCell)
      ? state.focusCell
      : null;
  const base = { ...state, layout, view, cells, focusCell };
  if (view.kind === 'project' && !cells.some((c) => c.projectPath)) {
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

      select: (view) =>
        set((s) => {
          if (view.kind !== 'project') return { view };
          const placed = placeProject(s.cells, s.layout, s.focusCell, view.path);
          return { view, cells: placed.cells, focusCell: placed.focus };
        }),
      toggleGroup: (name) =>
        set((s) => ({
          openGroups: s.openGroups.includes(name)
            ? s.openGroups.filter((g) => g !== name)
            : [...s.openGroups, name],
        })),
      openTab: (path, key) =>
        set((s) => {
          const list = s.tabs[path] ?? [];
          return {
            tabs: { ...s.tabs, [path]: list.includes(key) ? list : [...list, key] },
            activeTab: { ...s.activeTab, [path]: key },
            recency: bump(s.recency, key),
            cells: showInCell(s, path, key),
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
            activeTab,
            recency: s.recency.filter((k) => k !== key),
            cells: s.cells.some((c) => c.activeTab === key)
              ? s.cells.map((c) => (c.activeTab === key ? { ...c, activeTab: undefined } : c))
              : s.cells,
          };
        }),
      activate: (path, key) =>
        set((s) => ({
          activeTab: { ...s.activeTab, [path]: key },
          recency: bump(s.recency, key),
          cells: showInCell(s, path, key),
        })),
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
          return {
            cells: s.cells.map((c) =>
              c.id === id
                ? { ...c, activeTab: key }
                : c.activeTab === key
                  ? { ...c, activeTab: undefined }
                  : c,
            ),
            activeTab: path ? { ...s.activeTab, [path]: key } : s.activeTab,
            recency: bump(s.recency, key),
          };
        }),
      touchCell: (id) =>
        set((s) => {
          const cell = s.cells.find((c) => c.id === id);
          if (!cell) return {};
          const now = Date.now();
          const fresh = now - cell.lastInputAt < HANDS_ON_MS / 3;
          if (fresh && s.focusCell === id) return {};
          const shown = s.cells.slice(0, CELL_COUNT[s.layout]);
          const keys = assignTabs(
            shown,
            (path) => s.tabs[path] ?? [],
            (path) => s.activeTab[path],
          );
          const key = keys[shown.findIndex((c) => c.id === id)] ?? undefined;
          return {
            focusCell: id,
            view: cell.projectPath ? { kind: 'project', path: cell.projectPath } : s.view,
            seen: key && !isDevTab(key) ? { ...s.seen, [key]: now } : s.seen,
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
    }),
    {
      name: 'echo-workbench',
      version: 2,
      migrate: (persisted) => migrateWorkbench(persisted) as WorkbenchState,
      merge: (persisted, current) => ({ ...current, ...migrateWorkbench(persisted) }),
      partialize: (s) => ({
        view: s.view,
        openGroups: s.openGroups,
        tabs: s.tabs,
        activeTab: s.activeTab,
        recency: s.recency,
        seen: s.seen,
        layout: s.layout,
        cells: s.cells,
        focusCell: s.focusCell,
      }),
    },
  ),
);
