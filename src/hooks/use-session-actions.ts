import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkDeleteConversationSessions, deleteConversationSession } from '@/lib/ipc';
import { useUiStore } from '@/state/ui-store';

export function useDeleteSession() {
  const qc = useQueryClient();
  const setSelectedSessionPath = useUiStore((s) => s.setSelectedSessionPath);
  return useMutation({
    mutationFn: (filePath: string) => deleteConversationSession(filePath),
    onSuccess: () => {
      setSelectedSessionPath(null);
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useBulkDeleteSessions() {
  const qc = useQueryClient();
  const clear = useUiStore((s) => s.clearConversationsBulkSelection);
  return useMutation({
    mutationFn: (filePaths: string[]) => bulkDeleteConversationSessions(filePaths),
    onSuccess: () => {
      clear();
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
