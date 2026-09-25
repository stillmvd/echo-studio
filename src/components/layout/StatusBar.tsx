import { RefreshCw } from 'lucide-react';
import { useDbWatcher } from '@/hooks/use-db-watcher';
import { useReindex } from '@/hooks/use-reindex';
import { cn } from '@/lib/cn';

interface Props {
  total: number | undefined;
}

export function StatusBar({ total }: Props) {
  useDbWatcher();
  const reindex = useReindex();

  return (
    <div
      role="status"
      className="absolute right-6 bottom-6 z-20 flex h-11 max-w-[calc(100%-3rem)] items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] pr-1.5 pl-4 text-xs font-medium whitespace-nowrap text-[var(--color-text-muted)] shadow-[0_10px_26px_rgb(0_0_0/30%)]"
    >
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          reindex.running
            ? 'animate-pulse bg-[var(--color-warning)] motion-reduce:animate-none'
            : 'bg-[var(--color-success)] shadow-[0_0_8px_rgb(95_201_138/55%)]',
        )}
        title={reindex.running ? 'Reindexing…' : 'Watching index.db for changes'}
      />
      <span>
        {reindex.running ? 'reindexing' : 'watching'}
        {total !== undefined && (
          <>
            {' · '}
            <span className="text-[var(--color-text-primary)] tabular-nums">{total}</span> memories
          </>
        )}
      </span>
      {reindex.running && reindex.lastLine && (
        <span className="max-w-[240px] truncate font-mono text-[var(--color-text-secondary)]">
          {reindex.lastLine}
        </span>
      )}
      {reindex.error && (
        <span className="max-w-[240px] truncate text-[var(--color-danger)]" title={reindex.error}>
          {reindex.error}
        </span>
      )}
      <button
        type="button"
        onClick={reindex.start}
        disabled={reindex.running}
        title="Run `memory reindex` to rebuild vector embeddings"
        className="flex h-8 items-center gap-1.5 rounded-full bg-[var(--color-bg-tertiary)] px-3 text-[var(--color-text-primary)] transition-colors duration-200 hover:bg-[var(--color-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw
          className={cn(
            'h-3.5 w-3.5 text-[var(--color-text-muted)]',
            reindex.running && 'animate-spin motion-reduce:animate-none',
          )}
        />
        {reindex.running ? 'Reindexing…' : 'Reindex'}
      </button>
    </div>
  );
}
