import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import { listWorkbenchProjects } from '@/lib/ipc';

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
