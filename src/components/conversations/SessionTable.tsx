import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { Select } from '@/components/ui/Select';
import { useDeleteSession, useRenameSession } from '@/hooks/use-session-actions';
import { applyAgeFilter } from '@/lib/age-filter';
import { cn } from '@/lib/cn';
import { type SessionMeta, sessionDisplayTitle } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { RenameSessionDialog } from './RenameSessionDialog';

function originalTitle(s: SessionMeta): string {
  return s.customTitle?.trim() || s.aiTitle?.trim() || `${s.sessionId.slice(0, 8)}…`;
}

interface Props {
  sessions: SessionMeta[];
  isLoading: boolean;
  selectedProjectName: string | null;
}

type SortBy = 'date' | 'size' | 'duration' | 'msgs';

const columns: { key: SortBy | 'session' | 'branch'; label: string; sortable: boolean }[] = [
  { key: 'session', label: 'Session', sortable: false },
  { key: 'date', label: 'Last activity', sortable: true },
  { key: 'duration', label: 'Duration', sortable: true },
  { key: 'msgs', label: 'Msgs', sortable: true },
  { key: 'size', label: 'Size', sortable: true },
  { key: 'branch', label: 'Branch', sortable: false },
];

const ageFilterOptions = [
  { value: 'all' as const, label: 'All sessions' },
  { value: 'older30' as const, label: 'Older than 30 days' },
  { value: 'older90' as const, label: 'Older than 90 days' },
  { value: 'older365' as const, label: 'Older than 1 year' },
];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function compareSessions(a: SessionMeta, b: SessionMeta, by: SortBy): number {
  switch (by) {
    case 'date':
      return (a.lastEventAt ?? '').localeCompare(b.lastEventAt ?? '');
    case 'size':
      return a.sizeBytes - b.sizeBytes;
    case 'duration':
      return a.durationMs - b.durationMs;
    case 'msgs':
      return a.messageCount - b.messageCount;
  }
}

export function SessionTable({ sessions, isLoading, selectedProjectName }: Props) {
  const sortBy = useUiStore((s) => s.conversationsSortBy);
  const sortDir = useUiStore((s) => s.conversationsSortDir);
  const setSort = useUiStore((s) => s.setConversationsSort);
  const setSelectedSessionPath = useUiStore((s) => s.setSelectedSessionPath);
  const ageFilter = useUiStore((s) => s.conversationsAgeFilter);
  const setAgeFilter = useUiStore((s) => s.setConversationsAgeFilter);
  const bulkSelection = useUiStore((s) => s.conversationsBulkSelection);
  const toggleBulkPath = useUiStore((s) => s.toggleConversationsBulkPath);
  const setBulkSelection = useUiStore((s) => s.setConversationsBulkSelection);

  const rename = useRenameSession();
  const del = useDeleteSession();
  const [menu, setMenu] = useState<{ x: number; y: number; session: SessionMeta } | null>(null);
  const [renameTarget, setRenameTarget] = useState<SessionMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionMeta | null>(null);

  const visible = useMemo(() => applyAgeFilter(sessions, ageFilter), [sessions, ageFilter]);

  const sorted = useMemo(() => {
    const copy = [...visible];
    copy.sort((a, b) => {
      const cmp = compareSessions(a, b, sortBy);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [visible, sortBy, sortDir]);

  const visiblePaths = useMemo(() => visible.map((s) => s.filePath), [visible]);
  const allChecked =
    visiblePaths.length > 0 && visiblePaths.every((p) => bulkSelection.includes(p));
  const someChecked = bulkSelection.length > 0 && !allChecked;

  if (selectedProjectName === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
        Select a project to view its sessions.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
        Loading sessions…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
        No sessions in this project.
      </div>
    );
  }

  const onHeaderClick = (col: SortBy) => {
    if (sortBy === col) {
      setSort(col, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(col, 'desc');
    }
  };

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
          <span>
            {visible.length} of {sessions.length} sessions in {selectedProjectName}
          </span>
          <Select value={ageFilter} options={ageFilterOptions} onChange={setAgeFilter} />
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-[var(--color-bg-secondary)]">
              <tr>
                <th className="border-b border-[var(--color-border-subtle)] px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={() => {
                      if (allChecked || someChecked) setBulkSelection([]);
                      else setBulkSelection(visiblePaths);
                    }}
                    aria-label="Select all visible sessions"
                  />
                </th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      'border-b border-[var(--color-border-subtle)] px-3 py-2 text-left font-medium text-[var(--color-text-muted)]',
                      c.sortable &&
                        'cursor-pointer select-none hover:text-[var(--color-text-primary)]',
                    )}
                    onClick={c.sortable ? () => onHeaderClick(c.key as SortBy) : undefined}
                  >
                    {c.label}
                    {c.sortable && sortBy === c.key && (
                      <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-6 text-center text-[var(--color-text-muted)]"
                  >
                    No sessions match the age filter.
                  </td>
                </tr>
              ) : (
                sorted.map((s) => (
                  <tr
                    key={s.sessionId}
                    onClick={() => setSelectedSessionPath(s.filePath)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, session: s });
                    }}
                    className={cn(
                      'cursor-pointer border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-tertiary)]/40',
                      (bulkSelection.includes(s.filePath) ||
                        menu?.session.sessionId === s.sessionId) &&
                        'bg-[var(--color-bg-tertiary)]/40',
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={bulkSelection.includes(s.filePath)}
                        onChange={() => toggleBulkPath(s.filePath)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select session ${s.sessionId.slice(0, 8)}`}
                      />
                    </td>
                    <td className="max-w-[280px] px-3 py-1.5">
                      <div
                        className={cn(
                          'truncate',
                          s.customTitle || s.aiTitle
                            ? 'text-[var(--color-text-primary)]'
                            : 'font-mono text-[10px] text-[var(--color-text-muted)]',
                        )}
                        title={`${sessionDisplayTitle(s)}\n${s.sessionId}`}
                      >
                        {sessionDisplayTitle(s)}
                      </div>
                      {(s.userTitle || s.customTitle || s.aiTitle) && (
                        <div className="font-mono text-[9px] text-[var(--color-text-muted)]">
                          {s.sessionId.slice(0, 8)}
                          {s.userTitle && (
                            <span className="ml-1 text-[var(--color-accent)]">· renamed</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                      {s.lastEventAt ? s.lastEventAt.slice(0, 16).replace('T', ' ') : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                      {formatDuration(s.durationMs)}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                      {s.messageCount}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                      {formatBytes(s.sizeBytes)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                      {s.gitBranch ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Rename',
              icon: <Pencil className="h-3.5 w-3.5" />,
              onSelect: () => setRenameTarget(menu.session),
            },
            {
              label: 'Delete',
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
              onSelect: () => setDeleteTarget(menu.session),
            },
          ]}
        />
      )}

      <RenameSessionDialog
        open={!!renameTarget}
        initialValue={renameTarget?.userTitle ?? ''}
        fallbackTitle={renameTarget ? originalTitle(renameTarget) : ''}
        busy={rename.isPending}
        onCancel={() => setRenameTarget(null)}
        onSubmit={(title) => {
          if (!renameTarget) return;
          rename.mutate(
            { sessionId: renameTarget.sessionId, title },
            { onSuccess: () => setRenameTarget(null) },
          );
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete conversation?"
        description={
          deleteTarget ? `«${sessionDisplayTitle(deleteTarget)}» будет удалён безвозвратно.` : ''
        }
        confirmLabel="Delete"
        busy={del.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          del.mutate(deleteTarget.filePath, { onSuccess: () => setDeleteTarget(null) });
        }}
      />
    </>
  );
}
