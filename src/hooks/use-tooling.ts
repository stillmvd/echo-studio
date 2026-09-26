import { useQuery } from '@tanstack/react-query';
import { listToolScopes, readToolFile, scanToolScope } from '@/lib/ipc';
import type { ScopeKind } from '@/lib/types';

export function useToolScopes() {
  return useQuery({
    queryKey: ['tooling', 'scopes'],
    queryFn: listToolScopes,
    staleTime: 60_000,
  });
}

export function useToolScan(scope: { kind: ScopeKind; path: string | null }) {
  return useQuery({
    queryKey: ['tooling', 'scan', scope.kind, scope.path],
    queryFn: () => scanToolScope(scope),
    staleTime: 30_000,
  });
}

export function useToolFile(path: string | null) {
  return useQuery({
    queryKey: ['tooling', 'file', path],
    queryFn: () => readToolFile(path ?? ''),
    enabled: path !== null,
    staleTime: 30_000,
  });
}
