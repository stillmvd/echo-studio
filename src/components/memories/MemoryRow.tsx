import { cn } from '@/lib/cn';
import { splitHighlighted } from '@/lib/highlight';
import type { Memory } from '@/lib/types';

interface Props {
  memory: Memory;
  selected: boolean;
  onClick: () => void;
  highlightTerms: string[];
  bulkChecked: boolean;
  onToggleBulk: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  menuOpen: boolean;
}

const categoryColor: Record<string, string> = {
  decision: 'text-[var(--color-accent)]',
  bug: 'text-[var(--color-danger)]',
  pattern: 'text-[var(--color-success)]',
  context: 'text-[var(--color-text-secondary)]',
  learning: 'text-[var(--color-warning)]',
};

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const segs = splitHighlighted(text, terms);
  return (
    <>
      {segs.map((s, i) =>
        s.match ? (
          <mark
            // biome-ignore lint/suspicious/noArrayIndexKey: ephemeral spans
            key={i}
            className="rounded-sm bg-[var(--color-accent)]/25 px-0.5 text-[var(--color-text-primary)]"
          >
            {s.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: ephemeral spans
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export function MemoryRow({
  memory,
  selected,
  onClick,
  highlightTerms,
  bulkChecked,
  onToggleBulk,
  onContextMenu,
  menuOpen,
}: Props) {
  const cat = memory.category;
  return (
    <div
      className={cn(
        'flex w-full items-stretch gap-2 border-b border-[var(--color-border-subtle)] transition-colors',
        selected || menuOpen
          ? 'bg-[var(--color-bg-tertiary)]'
          : 'hover:bg-[var(--color-bg-tertiary)]/50',
      )}
    >
      <span className="flex shrink-0 items-center pl-3">
        <input
          type="checkbox"
          checked={bulkChecked}
          onChange={onToggleBulk}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select memory ${memory.title}`}
          className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-accent)]"
        />
      </span>
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        className="flex flex-1 flex-col gap-1 px-3 py-3 text-left"
      >
        <div className="flex items-baseline gap-2">
          <p className="flex-1 truncate text-sm text-[var(--color-text-primary)]">
            <Highlighted text={memory.title} terms={highlightTerms} />
          </p>
          {cat && (
            <span className={cn('shrink-0 text-[10px] uppercase', categoryColor[cat] ?? '')}>
              {cat}
            </span>
          )}
          {memory.status === 'archived' && (
            <span className="shrink-0 rounded-sm bg-[var(--color-bg-tertiary)] px-1 text-[9px] uppercase text-[var(--color-text-muted)]">
              archived
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--color-text-muted)]">
          <span className="truncate">{memory.project}</span>
          <span>·</span>
          <span>{memory.updatedAt.slice(0, 10)}</span>
          {memory.tags.length > 0 && (
            <>
              <span>·</span>
              <span className="truncate">
                {memory.tags
                  .slice(0, 3)
                  .map((t) => `#${t}`)
                  .join(' ')}
                {memory.tags.length > 3 ? ` +${memory.tags.length - 3}` : ''}
              </span>
            </>
          )}
        </div>
      </button>
    </div>
  );
}
