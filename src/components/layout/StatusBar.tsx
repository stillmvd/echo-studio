import { useDbWatcher } from '@/hooks/use-db-watcher';
import { useReindex } from '@/hooks/use-reindex';
import { cn } from '@/lib/cn';

interface Props {
  total: number | undefined;
  memoryHome: string | undefined;
  homeSource: string | undefined;
}

export function StatusBar({ total, memoryHome, homeSource }: Props) {
  useDbWatcher();
  const reindex = useReindex();

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-3 text-[10px] text-[var(--color-text-muted)]">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'inline-block h-1.5 w-1.5 rounded-full',
            reindex.running
              ? 'animate-pulse bg-[var(--color-warning)]'
              : 'bg-[var(--color-success)]',
          )}
          title={reindex.running ? 'Reindexing…' : 'Watching index.db for changes'}
        />
        <span>{reindex.running ? 'reindexing' : 'watching'}</span>
      </div>

      {total !== undefined && (
        <span>
          <span className="text-[var(--color-text-secondary)]">{total}</span> memories
        </span>
      )}

      {memoryHome && (
        <span className="truncate font-mono" title={memoryHome}>
          {memoryHome}
          {homeSource && <span className="ml-1 opacity-70">({homeSource})</span>}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {reindex.running && reindex.lastLine && (
          <span className="max-w-[260px] truncate font-mono text-[var(--color-text-secondary)]">
            {reindex.lastLine}
          </span>
        )}
        {reindex.error && (
          <span className="max-w-[260px] truncate text-[var(--color-danger)]" title={reindex.error}>
            {reindex.error}
          </span>
        )}
        <button
          type="button"
          onClick={reindex.start}
          disabled={reindex.running}
          className={cn(
            'rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 transition-colors hover:border-[var(--color-accent)]',
            reindex.running && 'cursor-not-allowed opacity-50',
          )}
          title="Run `memory reindex` to rebuild vector embeddings"
        >
          {reindex.running ? 'Reindexing…' : 'Reindex embeddings'}
        </button>
      </div>
    </footer>
  );
}
