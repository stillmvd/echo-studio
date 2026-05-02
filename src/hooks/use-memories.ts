import { useQuery } from '@tanstack/react-query';
import { getMemory, listMemories } from '@/lib/ipc';
import type { MemoriesFilter } from '@/lib/types';

export function useMemoriesList(filter: MemoriesFilter = {}) {
  return useQuery({
    queryKey: ['memories', 'list', filter],
    queryFn: () => listMemories(filter),
  });
}

export function useMemoryDetail(id: string | null) {
  return useQuery({
    queryKey: ['memories', 'detail', id],
    queryFn: () => (id ? getMemory(id) : Promise.resolve(null)),
    enabled: id !== null,
  });
}
