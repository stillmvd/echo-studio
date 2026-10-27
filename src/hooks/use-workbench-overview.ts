import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';
import { WEEK } from '@/lib/dashboard';
import { killProcesses, readGitStates, readLoad, readRateLimits, readUsage } from '@/lib/ipc';
import type { KillTarget, Load } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { useTauriEvent } from './use-workbench';

const MINUTE = 60_000;
const LOAD_EVERY = 5_000;
const HISTORY = 72;

function useMetricsOpen() {
  return useUiStore((s) => s.activeTab === 'workbench' || s.activeTab === 'dashboard');
}

export function useRateLimits() {
  const qc = useQueryClient();
  const open = useMetricsOpen();
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
  const open = useMetricsOpen();
  const week = useRateLimits().data?.sevenDay;
  const windowStart = week ? week.resetsAt - WEEK : null;
  return useQuery({
    queryKey: ['workbench', 'usage', windowStart],
    queryFn: () => readUsage(-new Date().getTimezoneOffset(), windowStart),
    placeholderData: (prev) => prev,
    enabled: open,
    refetchInterval: MINUTE,
  });
}

export function useGitStates(paths: string[]) {
  const open = useMetricsOpen();
  return useQuery({
    queryKey: ['workbench', 'git', paths],
    queryFn: () => readGitStates(paths),
    enabled: open && paths.length > 0,
    refetchInterval: MINUTE,
    refetchOnWindowFocus: true,
  });
}

interface LoadHistory {
  at: number;
  machine: number[];
  sessions: Record<string, number[]>;
  push: (at: number, load: Load) => void;
}

const tail = (list: number[] | undefined, v: number) => [...(list ?? []), v].slice(-HISTORY);

export const useLoadHistory = create<LoadHistory>((set) => ({
  at: 0,
  machine: [],
  sessions: {},
  push: (at, load) =>
    set((s) => {
      if (at <= s.at) return s;
      const cpu = new Map<string, number>();
      for (const r of load.rows) {
        if (r.session && !r.orphan) cpu.set(r.session, (cpu.get(r.session) ?? 0) + r.cpu);
      }
      const sessions: Record<string, number[]> = {};
      for (const [id, v] of cpu) sessions[id] = tail(s.sessions[id], v);
      return { at, machine: tail(s.machine, load.machine.cpu), sessions };
    }),
}));

export function useLoad() {
  const open = useMetricsOpen();
  const dashboard = useUiStore((s) => s.activeTab === 'dashboard');
  const query = useQuery({
    queryKey: ['workbench', 'load'],
    queryFn: readLoad,
    enabled: open,
    refetchInterval: dashboard ? LOAD_EVERY : LOAD_EVERY * 2,
    refetchOnWindowFocus: false,
  });
  const { data, dataUpdatedAt } = query;
  useEffect(() => {
    if (data) useLoadHistory.getState().push(dataUpdatedAt, data);
  }, [data, dataUpdatedAt]);
  return query;
}

export function useKillProcesses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ targets, confirmed }: { targets: KillTarget[]; confirmed: boolean }) =>
      killProcesses(targets, confirmed),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workbench', 'load'] }),
  });
}
