import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useBulkDeleteSessions } from '@/hooks/use-session-actions';
import { useUiStore } from '@/state/ui-store';

export function SessionBulkBar() {
  const ids = useUiStore((s) => s.conversationsBulkSelection);
  const clear = useUiStore((s) => s.clearConversationsBulkSelection);
  const del = useBulkDeleteSessions();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (ids.length === 0) return null;

  const onConfirm = async () => {
    setStatusMsg(null);
    const result = await del.mutateAsync(ids);
    setConfirmOpen(false);
    if (result.failed.length > 0) {
      setStatusMsg(
        `Deleted ${result.deleted.length}, failed ${result.failed.length}: ${result.failed[0]?.error ?? ''}`,
      );
    }
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-accent)]/10 px-4 py-2 text-xs">
        <span className="text-[var(--color-text-primary)]">{ids.length} sessions selected</span>
        <div className="flex items-center gap-2">
          {statusMsg && (
            <span className="max-w-[280px] truncate text-[var(--color-warning)]" title={statusMsg}>
              {statusMsg}
            </span>
          )}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={del.isPending}
            className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/15 px-2.5 py-1 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25 disabled:opacity-50"
          >
            Delete all
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={del.isPending}
            className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        busy={del.isPending}
        title={`Delete ${ids.length} sessions permanently?`}
        description="The .jsonl files will be removed from disk. This cannot be undone via this app."
        confirmLabel="Delete all"
        danger
        onConfirm={onConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
