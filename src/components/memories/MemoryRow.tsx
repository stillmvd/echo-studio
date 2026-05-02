import { cn } from '@/lib/cn';
import { splitHighlighted } from '@/lib/highlight';
import type { Memory } from '@/lib/types';

interface Props {
  memory: Memory;
  selected: boolean;
  onClick: () => void;
  highlightTerms: string[];
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

export function MemoryRow({ memory, selected, onClick, highlightTerms }: Props) {
  const cat = memory.category;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-1 border-b border-[var(--color-border-subtle)] px-4 py-3 text-left transition-colors',
        selected ? 'bg-[var(--color-bg-tertiary)]' : 'hover:bg-[var(--color-bg-tertiary)]/50',
      )}
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
  );
}
