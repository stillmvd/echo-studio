import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { SessionMeta } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';

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

  const sorted = useMemo(() => {
    const copy = [...sessions];
    copy.sort((a, b) => {
      const cmp = compareSessions(a, b, sortBy);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [sessions, sortBy, sortDir]);

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
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--color-border-subtle)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
        {sessions.length} sessions in {selectedProjectName}
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-[var(--color-bg-secondary)]">
            <tr>
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
            {sorted.map((s) => (
              <tr
                key={s.sessionId}
                className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-tertiary)]/40"
              >
                <td className="px-3 py-1.5 font-mono text-[10px] text-[var(--color-text-secondary)]">
                  {s.sessionId.slice(0, 8)}…
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                  {s.lastEventAt ? s.lastEventAt.slice(0, 16).replace('T', ' ') : '—'}
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                  {formatDuration(s.durationMs)}
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{s.messageCount}</td>
                <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                  {formatBytes(s.sizeBytes)}
                </td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                  {s.gitBranch ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
