import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { forgetClaudeSession, listClaudeSessions, listDevServers } from '@/lib/ipc';
import type { ClaudeSession, DevServer } from '@/lib/types';
import { endedTabs, misplacedTabs, movedTabs, stoppedDevTabs } from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { dispose, isFresh, rekey, rememberShort, shortOf } from './terminals';

export function useEndedTabs(sessions: ClaudeSession[]) {
  const tabs = useWorkbenchStore((s) => s.tabs);
  const closeTab = useWorkbenchStore((s) => s.closeTab);
  const ready = useQuery({
    queryKey: ['workbench', 'sessions'],
    queryFn: listClaudeSessions,
    enabled: false,
  }).isSuccess;
  const running = sessions.filter((s) => s.status !== 'exited');
  for (const s of running) if (s.shortId) rememberShort(s.sessionId, s.shortId);
  const live = new Set(running.map((s) => s.sessionId));
  const ended = ready ? endedTabs(tabs, live, isFresh) : [];
  const moved = movedTabs(ended, running, shortOf);
  const movedKeys = new Set(moved.map((t) => t.key));
  const close = ended
    .filter((t) => !movedKeys.has(t.key))
    .map((t) => `${t.path}\n${t.key}`)
    .join('\n\n');
  const move = moved.map((t) => `${t.path}\n${t.key}\n${t.to}`).join('\n\n');
  const rehome = misplacedTabs(tabs, running)
    .map((t) => `${t.from}\n${t.key}\n${t.to}`)
    .join('\n\n');

  useEffect(() => {
    if (!rehome) return;
    for (const triple of rehome.split('\n\n')) {
      const [from, key, to] = triple.split('\n');
      if (!from || !key || !to) continue;
      const st = useWorkbenchStore.getState();
      if (!st.tabs[to]?.includes(key)) {
        const prev = st.activeTab[to];
        const { cells, focusCell } = st;
        st.openTab(to, key);
        if (prev) st.activate(to, prev);
        if (st.mode === 'wall') useWorkbenchStore.setState({ cells, focusCell });
      }
      st.closeTab(from, key);
    }
  }, [rehome]);

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

  useEffect(() => {
    if (!move) return;
    for (const triple of move.split('\n\n')) {
      const [path, key, to] = triple.split('\n');
      if (!path || !key || !to) continue;
      const st = useWorkbenchStore.getState();
      if (!st.tabs[path]?.includes(to)) {
        if (!rekey(key, to)) dispose(key);
        st.renameTab(path, key, to);
        continue;
      }
      const prev = st.activeTab[path];
      dispose(key);
      st.closeTab(path, key);
      if (prev && prev !== key) st.activate(path, prev);
    }
  }, [move]);
}

export function useStoppedDevTabs(devs: DevServer[]) {
  const done = useRef(false);
  const loaded = useQuery({
    queryKey: ['workbench', 'dev'],
    queryFn: listDevServers,
    enabled: false,
  }).isSuccess;

  useEffect(() => {
    if (!loaded || done.current) return;
    done.current = true;
    const st = useWorkbenchStore.getState();
    for (const { path, key } of stoppedDevTabs(st.tabs, devs)) {
      dispose(key);
      st.closeTab(path, key);
    }
  }, [loaded, devs]);
}
