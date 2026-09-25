import { Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useBulkDeleteSessions } from '@/hooks/use-session-actions';
import { formatBytes } from '@/lib/projects';
import type { SessionMeta } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';

interface Props {
  sessions: SessionMeta[];
  visiblePaths: string[];
}

const pill =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium whitespace-nowrap outline-none transition-colors duration-120 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:opacity-50';

export function SessionBulkBar({ sessions, visiblePaths }: Props) {
  const ids = useUiStore((s) => s.conversationsBulkSelection);
  const setSelection = useUiStore((s) => s.setConversationsBulkSelection);
  const clear = useUiStore((s) => s.clearConversationsBulkSelection);
  const del = useBulkDeleteSessions();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (ids.length === 0) return null;

  const selectedBytes = sessions
    .filter((s) => ids.includes(s.filePath))
    .reduce((n, s) => n + s.sizeBytes, 0);
  const allSelected = visiblePaths.every((p) => ids.includes(p));

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
      <div
        role="toolbar"
        aria-label="Selected sessions"
        className="absolute bottom-5 left-1/2 z-10 flex h-[52px] max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--color-bg-secondary)] pr-2 pl-5 text-[13px] font-medium whitespace-nowrap text-[var(--color-text-muted)] tabular-nums shadow-[0_0_0_1px_var(--color-border),0_12px_30px_rgb(0_0_0/32%)] @max-[960px]:left-4 @max-[960px]:translate-x-0"
      >
        <span className="mr-1.5 truncate">
          <b className="font-bold text-[var(--color-text-primary)]">{ids.length}</b> selected ·{' '}
          {formatBytes(selectedBytes)}
        </span>
        {statusMsg && (
          <span className="max-w-[220px] truncate text-[var(--color-warning)]" title={statusMsg}>
            {statusMsg}
          </span>
        )}
        {!allSelected && (
          <button
            type="button"
            onClick={() => setSelection(visiblePaths)}
            disabled={del.isPending}
            className={`${pill} px-4 hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]`}
          >
            Select all
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={del.isPending}
          className={`${pill} bg-[var(--color-danger-soft)] px-4 text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_24%,transparent)]`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={del.isPending}
          title="Cancel selection"
          aria-label="Cancel selection"
          className={`${pill} w-9 bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]`}
        >
          <X className="h-4 w-4" />
        </button>
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
