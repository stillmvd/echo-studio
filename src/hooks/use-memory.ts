import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import {
  archiveMemoryRecord,
  findMemoryDuplicates,
  listMemory,
  listMemoryProjects,
  mergeMemoryRecords,
  moveMemoryRecord,
  patchMemoryRecord,
  readMemoryFile,
  restoreMemoryRecord,
  saveMemoryFile,
  searchMemory,
} from '@/lib/ipc';
import type { RecordPatch } from '@/lib/types';

export function useMemoryProjects() {
  return useQuery({
    queryKey: ['memory', 'projects'],
    queryFn: listMemoryProjects,
    staleTime: 30_000,
  });
}

export function useMemoryListing(slug: string | null) {
  return useQuery({
    queryKey: ['memory', 'listing', slug],
    queryFn: () => listMemory(slug ?? ''),
    enabled: slug !== null,
    staleTime: 30_000,
  });
}

export function useMemoryFile(path: string | null) {
  return useQuery({
    queryKey: ['memory', 'file', path],
    queryFn: () => readMemoryFile(path ?? ''),
    enabled: path !== null,
    staleTime: 30_000,
  });
}

export function useMemorySearch(query: string, slug: string | null) {
  return useQuery({
    queryKey: ['memory', 'search', query, slug],
    queryFn: () => searchMemory(query, slug),
    enabled: query.length >= 2,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

function useMemoryMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: ['memory'] }),
  });
}

export function useSaveMemoryFile() {
  return useMemoryMutation(({ path, text }: { path: string; text: string }) =>
    saveMemoryFile(path, text),
  );
}

export function useArchiveMemoryRecord() {
  return useMemoryMutation((path: string) => archiveMemoryRecord(path));
}

export function useRestoreMemoryRecord() {
  return useMemoryMutation((archivedPath: string) => restoreMemoryRecord(archivedPath));
}

export function useMoveMemoryRecord() {
  return useMemoryMutation(({ path, targetSlug }: { path: string; targetSlug: string }) =>
    moveMemoryRecord(path, targetSlug),
  );
}

export function useMemoryDuplicates(slug: string | null) {
  return useQuery({
    queryKey: ['memory', 'duplicates', slug],
    queryFn: () => findMemoryDuplicates(slug),
    staleTime: 30_000,
  });
}

export function usePatchMemoryRecord() {
  return useMemoryMutation(({ path, patch }: { path: string; patch: RecordPatch }) =>
    patchMemoryRecord(path, patch),
  );
}

export function useMergeMemoryRecords() {
  return useMemoryMutation(({ canonical, absorbed }: { canonical: string; absorbed: string[] }) =>
    mergeMemoryRecords(canonical, absorbed),
  );
}

export function useMemoryWatch() {
  const qc = useQueryClient();
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    listen('memory://changed', () => {
      void qc.invalidateQueries({ queryKey: ['memory'] });
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
