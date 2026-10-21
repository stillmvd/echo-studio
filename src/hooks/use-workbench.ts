import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useMemo, useRef } from 'react';
import {
  listClaudeSessions,
  listDevServers,
  listWorkbenchProjects,
  type RawClaudeSession,
  setWorkbenchActive,
} from '@/lib/ipc';
import type { ClaudeSession, DevServer } from '@/lib/types';
import { withProjects } from '@/lib/workbench';

export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    listen<T>(event, (e) => ref.current(e.payload))
      .then((un) => {
        if (cancelled) un();
        else off = un;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      off?.();
    };
  }, [event]);
}

export function useClaudeSessions(active?: boolean): ClaudeSession[] {
  const qc = useQueryClient();
  const { data: tree } = useWorkbenchProjects();
  useEffect(() => {
    if (active === undefined) return;
    void setWorkbenchActive(active).catch(() => {});
  }, [active]);
  useTauriEvent<RawClaudeSession[]>('workbench://sessions', (list) => {
    qc.setQueryData(['workbench', 'sessions'], list);
  });
  const { data } = useQuery({
    queryKey: ['workbench', 'sessions'],
    queryFn: listClaudeSessions,
    staleTime: 15_000,
    retry: false,
  });
  return useMemo(() => withProjects(data ?? [], tree), [data, tree]);
}

export function useDevServers(): DevServer[] {
  const qc = useQueryClient();
  useTauriEvent('workbench://dev', () => {
    void qc.invalidateQueries({ queryKey: ['workbench', 'dev'] });
  });
  return (
    useQuery({ queryKey: ['workbench', 'dev'], queryFn: listDevServers, staleTime: 10_000 }).data ??
    NO_DEVS
  );
}

const NO_DEVS: DevServer[] = [];

export function useWorkbenchProjects() {
  const qc = useQueryClient();
  useTauriEvent('workbench://projects', () => {
    void qc.invalidateQueries({ queryKey: ['workbench', 'projects'] });
  });
  return useQuery({
    queryKey: ['workbench', 'projects'],
    queryFn: listWorkbenchProjects,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
