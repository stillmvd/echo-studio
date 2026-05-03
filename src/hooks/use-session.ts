import { useQuery } from '@tanstack/react-query';
import { readSessionEvents, searchSessionText } from '@/lib/ipc';

export function useSessionEvents(filePath: string | null) {
  return useQuery({
    queryKey: ['conversations', 'session', filePath],
    queryFn: () => (filePath ? readSessionEvents(filePath) : Promise.resolve([])),
    enabled: filePath !== null,
    staleTime: 60_000,
  });
}

export function useCrossSessionSearch(projectId: string | null, query: string) {
  return useQuery({
    queryKey: ['conversations', 'search', projectId, query],
    queryFn: () =>
      projectId && query.trim() ? searchSessionText(projectId, query.trim()) : Promise.resolve([]),
    enabled: projectId !== null && query.trim().length > 0,
    staleTime: 30_000,
  });
}
