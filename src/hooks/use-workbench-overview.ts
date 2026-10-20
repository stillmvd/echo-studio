import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { killProcesses, listProcesses, readGitStates, readRateLimits, readUsage } from '@/lib/ipc';
import type { KillTarget } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { useTauriEvent } from './use-workbench';

const MINUTE = 60_000;

function useOpen() {
  return useUiStore((s) => s.activeTab === 'workbench');
}

export function useRateLimits() {
  const qc = useQueryClient();
  const open = useOpen();
  useTauriEvent('workbench://limits', () => {
    void qc.invalidateQueries({ queryKey: ['workbench', 'limits'] });
  });
  return useQuery({
    queryKey: ['workbench', 'limits'],
    queryFn: readRateLimits,
    enabled: open,
    refetchInterval: MINUTE,
  });
}

export function useUsage() {
  const open = useOpen();
  return useQuery({
    queryKey: ['workbench', 'usage'],
    queryFn: readUsage,
    enabled: open,
    refetchInterval: MINUTE,
  });
}

export function useGitStates(paths: string[]) {
  const open = useOpen();
  return useQuery({
    queryKey: ['workbench', 'git', paths],
    queryFn: () => readGitStates(paths),
    enabled: open && paths.length > 0,
    refetchInterval: MINUTE,
    refetchOnWindowFocus: true,
  });
}

export function useProcesses() {
  const open = useOpen();
  return useQuery({
    queryKey: ['workbench', 'processes'],
    queryFn: listProcesses,
    enabled: open,
    refetchInterval: 5_000,
  });
}

export function useKillProcesses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ targets, confirmed }: { targets: KillTarget[]; confirmed: boolean }) =>
      killProcesses(targets, confirmed),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workbench', 'processes'] }),
  });
}
