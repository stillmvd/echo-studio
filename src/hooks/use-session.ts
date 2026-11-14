import { useQuery } from '@tanstack/react-query';
import { readSessionEvents, searchSessionText } from '@/lib/ipc';
import type { AgentKind } from '@/lib/types';

export function useSessionEvents(filePath: string | null) {
  return useQuery({
    queryKey: ['conversations', 'session', filePath],
    queryFn: () => (filePath ? readSessionEvents(filePath) : Promise.resolve([])),
    enabled: filePath !== null,
    staleTime: 60_000,
  });
}

export function useCrossSessionSearch(projectId: string | null, query: string, source?: AgentKind) {
  return useQuery({
    queryKey: ['conversations', 'search', projectId, query, source ?? 'current'],
    queryFn: () =>
      projectId && query.trim()
        ? searchSessionText(projectId, query.trim(), source)
        : Promise.resolve([]),
    enabled: projectId !== null && query.trim().length > 0,
    staleTime: 30_000,
  });
}
