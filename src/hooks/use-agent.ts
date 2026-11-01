import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { getAgents, kimiReadiness, setAgent } from '@/lib/ipc';
import type { AgentKind, Agents } from '@/lib/types';
import { AGENT_NAME } from '@/lib/workbench';
import { toast } from '@/state/toast-store';
import { useUiStore } from '@/state/ui-store';

const AGENTS = ['agents'];

function resetAgentSelection() {
  useUiStore.setState({
    conversationsProjectId: null,
    selectedSessionPath: null,
    selectedToolId: null,
    conversationsBulkSelection: [],
    sessionSearchQuery: '',
  });
}

export function useAgents() {
  const qc = useQueryClient();
  useEffect(() => {
    const off = listen('echo://agent-changed', () => {
      resetAgentSelection();
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

export function useKimiReadiness(watch = false) {
  return useQuery({
    queryKey: ['kimi-readiness'],
    queryFn: kimiReadiness,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: watch ? 3000 : false,
  });
}

export function useAgentName(): string {
  const { data } = useAgents();
  return AGENT_NAME[data?.current ?? 'claude'];
}

export function useSetAgent(toastErrors = true) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: AgentKind) => setAgent(kind),
    onSuccess: (data: Agents) => {
      resetAgentSelection();
      qc.setQueryData(AGENTS, data);
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== AGENTS[0] });
    },
    onError: (e) => {
      if (toastErrors) toast(`Не удалось сменить агента: ${String(e)}`, 'fail');
    },
  });
}
