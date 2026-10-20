import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WorkbenchView = { kind: 'overview' } | { kind: 'project'; path: string };
export type WallLayout = '1x1' | '2x1' | '2x2';

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

  select: (view: WorkbenchView) => void;
  toggleGroup: (name: string) => void;
  openTab: (path: string, key: string) => void;
  closeTab: (path: string, key: string) => void;
  activate: (path: string, key: string) => void;
  markSeen: (sessionId: string) => void;
  setLayout: (layout: WallLayout) => void;
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

      select: (view) => set({ view }),
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
      setLayout: (layout) => set({ layout }),
    }),
    {
      name: 'echo-workbench',
      version: 1,
      migrate: (persisted) => persisted as WorkbenchState,
      partialize: (s) => ({
        view: s.view,
        openGroups: s.openGroups,
        tabs: s.tabs,
        activeTab: s.activeTab,
        recency: s.recency,
        seen: s.seen,
        layout: s.layout,
      }),
    },
  ),
);
