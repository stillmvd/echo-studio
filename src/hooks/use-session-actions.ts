import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bulkDeleteConversationSessions,
  deleteConversationSession,
  renameSession,
} from '@/lib/ipc';
import { useUiStore } from '@/state/ui-store';

export function useRenameSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ filePath, title }: { filePath: string; title: string }) =>
      renameSession(filePath, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filePath: string) => deleteConversationSession(filePath),
    onSuccess: (_, filePath) => {
      const ui = useUiStore.getState();
      if (ui.selectedSessionPath === filePath) ui.setSelectedSessionPath(null);
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
