import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isDevTab, useWorkbenchStore } from './workbench-store';

const LIMIT = 30;

interface RecentState {
  history: string[];
  visit: (sessionId: string) => void;
}

export const useRecentStore = create<RecentState>()(
  persist(
    (set) => ({
      history: [],
      visit: (sessionId) =>
        set((s) =>
          s.history[0] === sessionId
            ? {}
            : {
                history: [sessionId, ...s.history.filter((id) => id !== sessionId)].slice(0, LIMIT),
              },
        ),
    }),
    { name: 'echo-recent', partialize: (s) => ({ history: s.history }) },
  ),
);

useWorkbenchStore.subscribe((s, prev) => {
  const key = s.recency[0];
  if (key && key !== prev.recency[0] && !isDevTab(key)) useRecentStore.getState().visit(key);
});
