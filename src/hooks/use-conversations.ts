import { useQuery } from '@tanstack/react-query';
import { useAgents } from '@/hooks/use-agent';
import { listConversationProjects, listConversationSessions } from '@/lib/ipc';
import type { AgentKind } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';

export function useConversationSource(): AgentKind {
  const current = useAgents().data?.current ?? 'claude';
  const archive = useUiStore((s) => s.conversationsArchive);
  return current === 'kimi' && archive ? 'claude' : current;
}

export function useConversationProjects(source?: AgentKind) {
  return useQuery({
    queryKey: ['conversations', 'projects', source ?? 'current'],
    queryFn: () => listConversationProjects(source),
    staleTime: 60_000,
  });
}

export function useConversationSessions(projectId: string | null, source?: AgentKind) {
  return useQuery({
    queryKey: ['conversations', 'sessions', projectId, source ?? 'current'],
    queryFn: () => (projectId ? listConversationSessions(projectId, source) : Promise.resolve([])),
    enabled: projectId !== null,
    staleTime: 30_000,
  });
}
