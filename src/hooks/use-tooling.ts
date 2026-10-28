import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import {
  checkToolUpdates,
  deleteTool,
  listConfigBackups,
  listTools,
  readToolRuns,
  setToolEnabled,
  updateTool,
} from '@/lib/ipc';
import type { ToolEntry, UpdateCheck } from '@/lib/tools';
import type { ToggleTarget } from '@/lib/types';
import { toast } from '@/state/toast-store';

const LIST = ['tooling', 'list'];
const RUNS = ['tool-runs'];
const UPDATES = ['tool-updates'];
const UPDATE = ['tool-update'];

export const useUpdating = () => useIsMutating({ mutationKey: UPDATE }) > 0;

export function useTools() {
  return useQuery({ queryKey: LIST, queryFn: listTools, staleTime: 30_000 });
}

export function useToolRuns() {
  return useQuery({ queryKey: RUNS, queryFn: readToolRuns, staleTime: 5 * 60_000, retry: false });
}

export function useToolUpdates() {
  return useQuery({
    queryKey: UPDATES,
    queryFn: checkToolUpdates,
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
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
    mutationFn: ({ target, enabled }: { id: string; target: ToggleTarget; enabled: boolean }) =>
      setToolEnabled(target, enabled),
    onMutate: async ({ id, target, enabled }) => {
      if (target.projectPath) return { previous: undefined };
      await qc.cancelQueries({ queryKey: LIST });
      const previous = qc.getQueryData<ToolEntry[]>(LIST);
      qc.setQueryData<ToolEntry[]>(LIST, (list) =>
        list?.map((e) => (e.id === id ? { ...e, state: enabled ? 'enabled' : 'disabled' } : e)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) qc.setQueryData(LIST, context.previous);
      toast(`Не удалось переключить: ${String(error)}`, 'fail');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tooling'] });
    },
  });
}

export function useDeleteTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, projects }: { id: string; projects: string[] }) => deleteTool(id, projects),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tooling'] });
      void qc.invalidateQueries({ queryKey: RUNS });
    },
  });
}

export function useUpdateTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: UPDATE,
    mutationFn: (id: string) => updateTool(id),
    onSuccess: (_r, id) => {
      qc.setQueryData<UpdateCheck>(UPDATES, (c) =>
        c ? { ...c, updates: c.updates.filter((u) => u.id !== id) } : c,
      );
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
