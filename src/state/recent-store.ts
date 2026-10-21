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

export function seedRecent() {
  if (useRecentStore.getState().history.length) return;
  const history = useWorkbenchStore
    .getState()
    .recency.filter((k) => !isDevTab(k))
    .slice(0, LIMIT);
  if (history.length) useRecentStore.setState({ history });
}

seedRecent();

useWorkbenchStore.subscribe((s, prev) => {
  const key = s.recency[0];
  if (!key || key === prev.recency[0] || isDevTab(key)) return;
  if (s.recency.length < prev.recency.length) return;
  useRecentStore.getState().visit(key);
});
