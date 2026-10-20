import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  emptyCells,
  HANDS_ON_MS,
  placeProject,
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
          };
        }),
      activate: (path, key) =>
        set((s) => ({
          activeTab: { ...s.activeTab, [path]: key },
          recency: bump(s.recency, key),
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
          cells: s.cells.map((c) =>
            c.id === id ? { ...c, pinned: !c.pinned, manual: c.pinned ? false : c.manual } : c,
          ),
        })),
      touchCell: (id) =>
        set((s) => {
          const cell = s.cells.find((c) => c.id === id);
          if (!cell) return {};
          const now = Date.now();
          const fresh = now - cell.lastInputAt < HANDS_ON_MS / 3;
          if (fresh && s.focusCell === id) return {};
          return {
            focusCell: id,
            view: cell.projectPath ? { kind: 'project', path: cell.projectPath } : s.view,
            cells: fresh
              ? s.cells
              : s.cells.map((c) => (c.id === id ? { ...c, lastInputAt: now } : c)),
          };
        }),
    }),
    {
      name: 'echo-workbench',
      version: 2,
      migrate: (persisted) => {
        const state = persisted as Partial<WorkbenchState>;
        return { ...state, cells: state.cells ?? emptyCells(), focusCell: null } as WorkbenchState;
      },
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
