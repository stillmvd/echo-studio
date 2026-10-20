import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { killProcesses, listProcesses, readGitStates, readRateLimits, readUsage } from '@/lib/ipc';
import { useTauriEvent } from './use-workbench';

const MINUTE = 60_000;

export function useRateLimits() {
  const qc = useQueryClient();
  useTauriEvent('workbench://limits', () => {
    void qc.invalidateQueries({ queryKey: ['workbench', 'limits'] });
  });
  return useQuery({
    queryKey: ['workbench', 'limits'],
    queryFn: readRateLimits,
    refetchInterval: MINUTE,
  });
}

export function useUsage() {
  return useQuery({
    queryKey: ['workbench', 'usage'],
    queryFn: readUsage,
    refetchInterval: MINUTE,
  });
}

export function useGitStates(paths: string[]) {
  return useQuery({
    queryKey: ['workbench', 'git', paths],
    queryFn: () => readGitStates(paths),
    enabled: paths.length > 0,
    refetchInterval: MINUTE,
    refetchOnWindowFocus: true,
  });
}

export function useProcesses() {
  return useQuery({
    queryKey: ['workbench', 'processes'],
    queryFn: listProcesses,
    refetchInterval: 5_000,
  });
}

export function useKillProcesses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pids, confirmed }: { pids: number[]; confirmed: boolean }) =>
      killProcesses(pids, confirmed),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workbench', 'processes'] }),
  });
}
