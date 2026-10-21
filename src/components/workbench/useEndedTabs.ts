import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { emptyClaudeSessions, forgetClaudeSession, listClaudeSessions } from '@/lib/ipc';
import type { ClaudeSession } from '@/lib/types';
import { endedTabs, tabsToClose } from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { dispose, isFresh, shortOf } from './terminals';

const NONE: string[] = [];

export function useEndedTabs(sessions: ClaudeSession[]) {
  const tabs = useWorkbenchStore((s) => s.tabs);
  const autoTabs = useWorkbenchStore((s) => s.autoTabs);
  const closeTab = useWorkbenchStore((s) => s.closeTab);
  const ready = useQuery({
    queryKey: ['workbench', 'sessions'],
    queryFn: listClaudeSessions,
    enabled: false,
  }).isSuccess;
  const live = new Set(sessions.filter((s) => s.status !== 'exited').map((s) => s.sessionId));
  const ended = ready ? endedTabs(tabs, live, isFresh) : [];
  const ids = ended
    .map((t) => t.key)
    .sort()
    .join('\n');
  const empty = useQuery({
    queryKey: ['workbench', 'empty-sessions', ids],
    queryFn: () => emptyClaudeSessions(ids.split('\n')),
    enabled: ids !== '',
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  }).data;
  const close = tabsToClose(ended, autoTabs, empty ?? NONE)
    .map((t) => `${t.path}\n${t.key}`)
    .join('\n\n');

  useEffect(() => {
    if (!close) return;
    for (const pair of close.split('\n\n')) {
      const [path, key] = pair.split('\n');
      if (!path || !key) continue;
      const short = shortOf(key);
      if (short) void forgetClaudeSession(short).catch(() => {});
      dispose(key);
      closeTab(path, key);
    }
  }, [close, closeTab]);
}
