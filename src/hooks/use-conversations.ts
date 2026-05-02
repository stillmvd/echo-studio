import { useQuery } from '@tanstack/react-query';
import { listConversationProjects, listConversationSessions } from '@/lib/ipc';

export function useConversationProjects() {
  return useQuery({
    queryKey: ['conversations', 'projects'],
    queryFn: listConversationProjects,
    staleTime: 60_000,
  });
}

export function useConversationSessions(projectId: string | null) {
  return useQuery({
    queryKey: ['conversations', 'sessions', projectId],
    queryFn: () => (projectId ? listConversationSessions(projectId) : Promise.resolve([])),
    enabled: projectId !== null,
    staleTime: 30_000,
  });
}
