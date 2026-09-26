import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import {
  listConfigBackups,
  listToolScopes,
  readToolFile,
  scanToolScope,
  setToolEnabled,
} from '@/lib/ipc';
import { applyToggle } from '@/lib/tooling';
import type { ScanResult, ScopeKind, ToggleTarget } from '@/lib/types';

export function useToolScopes() {
  return useQuery({
    queryKey: ['tooling', 'scopes'],
    queryFn: listToolScopes,
    staleTime: 60_000,
  });
}

export function useToolScan(scope: { kind: ScopeKind; path: string | null }) {
  return useQuery({
    queryKey: ['tooling', 'scan', scope.kind, scope.path],
    queryFn: () => scanToolScope(scope),
    staleTime: 30_000,
  });
}

export function useToolFile(path: string | null) {
  return useQuery({
    queryKey: ['tooling', 'file', path],
    queryFn: () => readToolFile(path ?? ''),
    enabled: path !== null,
    staleTime: 30_000,
  });
}

export function useConfigBackups() {
  return useQuery({
    queryKey: ['tooling', 'backups'],
    queryFn: listConfigBackups,
    staleTime: 30_000,
  });
}

export function useSetToolEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ target, enabled }: { target: ToggleTarget; enabled: boolean }) =>
      setToolEnabled(target, enabled),
    onMutate: async ({ target, enabled }) => {
      await qc.cancelQueries({ queryKey: ['tooling', 'scan'] });
      const previous = qc.getQueriesData<ScanResult>({ queryKey: ['tooling', 'scan'] });
      qc.setQueriesData<ScanResult>({ queryKey: ['tooling', 'scan'] }, (scan) =>
        scan ? { ...scan, items: applyToggle(scan.items, target, enabled) } : scan,
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tooling'] }),
  });
}

export function useToolingWatch() {
  const qc = useQueryClient();
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    listen('tooling://changed', () => {
      void qc.invalidateQueries({ queryKey: ['tooling'] });
    })
      .then((un) => {
        if (cancelled) un();
        else off = un;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      off?.();
    };
  }, [qc]);
}
