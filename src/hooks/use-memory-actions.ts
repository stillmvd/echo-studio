import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  archiveMemory,
  bulkArchiveMemories,
  bulkDeleteMemories,
  bulkRestoreMemories,
  deleteMemory,
  restoreMemory,
  updateMemory,
} from '@/lib/ipc';
import type { MemoryPatch } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';

export function useUpdateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MemoryPatch }) => updateMemory(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}

export function useArchiveMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => archiveMemory(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}

export function useRestoreMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreMemory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  const setSelectedMemoryId = useUiStore((s) => s.setSelectedMemoryId);
  return useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onSuccess: () => {
      setSelectedMemoryId(null);
      qc.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}

export function useBulkArchive() {
  const qc = useQueryClient();
  const clear = useUiStore((s) => s.clearBulkSelection);
  return useMutation({
    mutationFn: ({ ids, reason }: { ids: string[]; reason?: string }) =>
      bulkArchiveMemories(ids, reason),
    onSuccess: () => {
      clear();
      qc.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}

export function useBulkRestore() {
  const qc = useQueryClient();
  const clear = useUiStore((s) => s.clearBulkSelection);
  return useMutation({
    mutationFn: (ids: string[]) => bulkRestoreMemories(ids),
    onSuccess: () => {
      clear();
      qc.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}

export function useBulkDelete() {
  const qc = useQueryClient();
  const clear = useUiStore((s) => s.clearBulkSelection);
  const setSelectedMemoryId = useUiStore((s) => s.setSelectedMemoryId);
  return useMutation({
    mutationFn: (ids: string[]) => bulkDeleteMemories(ids),
    onSuccess: () => {
      clear();
      setSelectedMemoryId(null);
      qc.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}
