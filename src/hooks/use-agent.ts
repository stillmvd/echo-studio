import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { getAgents, setAgent } from '@/lib/ipc';
import type { AgentKind, Agents } from '@/lib/types';
import { toast } from '@/state/toast-store';

const AGENTS = ['agents'];

export function useAgents() {
  const qc = useQueryClient();
  useEffect(() => {
    const off = listen('echo://agent-changed', () => {
      qc.invalidateQueries({ queryKey: AGENTS });
    });
    return () => {
      off.then((f) => f()).catch(() => {});
    };
  }, [qc]);
  return useQuery({
    queryKey: AGENTS,
    queryFn: getAgents,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useSetAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: AgentKind) => setAgent(kind),
    onSuccess: (data: Agents) => qc.setQueryData(AGENTS, data),
    onError: (e) => toast(`Не удалось сменить агента: ${String(e)}`, 'fail'),
  });
}
