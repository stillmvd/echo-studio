import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useBulkArchive, useBulkDelete, useBulkRestore } from '@/hooks/use-memory-actions';
import { useUiStore } from '@/state/ui-store';

export function BulkActionBar() {
  const ids = useUiStore((s) => s.bulkSelectionIds);
  const status = useUiStore((s) => s.status);
  const clear = useUiStore((s) => s.clearBulkSelection);
  const archive = useBulkArchive();
  const restore = useBulkRestore();
  const del = useBulkDelete();

  const [confirm, setConfirm] = useState<null | 'archive' | 'restore' | 'delete'>(null);

  if (ids.length === 0) return null;

  const busy = archive.isPending || restore.isPending || del.isPending;

  const onConfirm = async () => {
    if (confirm === 'archive') await archive.mutateAsync({ ids });
    else if (confirm === 'restore') await restore.mutateAsync(ids);
    else if (confirm === 'delete') await del.mutateAsync(ids);
    setConfirm(null);
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-accent)]/10 px-4 py-2 text-xs">
        <span className="text-[var(--color-text-primary)]">{ids.length} selected</span>
        <div className="flex items-center gap-2">
          {status === 'archived' ? (
            <ActionBtn onClick={() => setConfirm('restore')} disabled={busy}>
              Restore all
            </ActionBtn>
          ) : (
            <ActionBtn onClick={() => setConfirm('archive')} disabled={busy}>
              Archive all
            </ActionBtn>
          )}
          <ActionBtn onClick={() => setConfirm('delete')} disabled={busy} danger>
            Delete all
          </ActionBtn>
          <ActionBtn onClick={clear} disabled={busy}>
            Cancel
          </ActionBtn>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        busy={busy}
        title={
          confirm === 'archive'
            ? `Archive ${ids.length} memories?`
            : confirm === 'restore'
              ? `Restore ${ids.length} memories?`
              : `Delete ${ids.length} memories permanently?`
        }
        description={
          confirm === 'delete'
            ? 'A backup of index.db will be created in ~/.memory/.backups before deletion. The action cannot be undone via this app, but the backup file remains.'
            : 'A backup of index.db will be created automatically.'
        }
        confirmLabel={
          confirm === 'archive'
            ? 'Archive all'
            : confirm === 'restore'
              ? 'Restore all'
              : 'Delete all'
        }
        danger={confirm === 'delete'}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? 'rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/15 px-2.5 py-1 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25 disabled:opacity-50'
          : 'rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50'
      }
    >
      {children}
    </button>
  );
}
