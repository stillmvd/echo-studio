import { useQuery } from '@tanstack/react-query';
import { listDbBackups, readEchovaultConfig } from '@/lib/ipc';

export function useEchovaultConfig() {
  return useQuery({
    queryKey: ['settings', 'echovault-config'],
    queryFn: readEchovaultConfig,
    staleTime: 60_000,
  });
}

export function useDbBackups() {
  return useQuery({
    queryKey: ['settings', 'backups'],
    queryFn: listDbBackups,
    staleTime: 30_000,
  });
}
