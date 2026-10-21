import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { killProcesses, listProcesses, readGitStates, readRateLimits, readUsage } from '@/lib/ipc';
import type { KillTarget } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { useWorkbenchStore } from '@/state/workbench-store';
import { useTauriEvent } from './use-workbench';

const MINUTE = 60_000;

function useOpen() {
  return useUiStore((s) => s.activeTab === 'workbench');
}

function useOverviewOpen() {
  const overview = useWorkbenchStore((s) => s.view.kind === 'overview');
  return useOpen() && overview;
}

export function useRateLimits() {
  const qc = useQueryClient();
  const open = useOverviewOpen();
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
  const open = useOverviewOpen();
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
  const open = useOverviewOpen();
  return useQuery({
    queryKey: ['workbench', 'processes'],
    queryFn: listProcesses,
    enabled: open,
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
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
