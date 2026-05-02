import { cn } from '@/lib/cn';
import type { ConversationProject } from '@/lib/types';

interface Props {
  projects: ConversationProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function ConversationsProjectSidebar({ projects, selectedId, onSelect }: Props) {
  const totalSize = projects.reduce((s, p) => s + p.totalSize, 0);
  const totalSessions = projects.reduce((s, p) => s + p.sessionCount, 0);

  return (
    <aside className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--color-border-subtle)] px-4 py-3">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">Projects</p>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          {projects.length} projects · {totalSessions} sessions · {formatBytes(totalSize)}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {projects.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[var(--color-text-muted)]">
            No conversations found in ~/.claude/projects/
          </p>
        ) : (
          <ul className="space-y-0.5">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left transition-colors',
                    selectedId === p.id
                      ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/60',
                  )}
                >
                  <span className="truncate text-sm">{p.displayName}</span>
                  <span className="flex justify-between text-[10px] text-[var(--color-text-muted)]">
                    <span>{p.sessionCount} sessions</span>
                    <span>{formatBytes(p.totalSize)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
