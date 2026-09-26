import { cn } from '@/lib/cn';
import type { KindFilter } from '@/lib/tooling';
import { KIND_META, KIND_ORDER } from './kinds';

export function TypeFilter({
  value,
  counts,
  onChange,
}: {
  value: KindFilter;
  counts: Record<KindFilter, number>;
  onChange: (v: KindFilter) => void;
}) {
  return (
    <fieldset
      aria-label="Filter by type"
      className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
    >
      {KIND_ORDER.map((k) => {
        const { label, icon: Icon } = KIND_META[k];
        const on = value === k;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(k)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease-trail)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] active:scale-[.96]',
              on
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-text-primary)] shadow-[inset_0_0_0_1.5px_var(--color-accent)]'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]',
            )}
          >
            <Icon
              className={cn('h-3.5 w-3.5', on && 'text-[var(--color-accent)]')}
              strokeWidth={1.75}
            />
            {label}
            <b className="text-[11px] font-bold text-[var(--color-text-primary)] tabular-nums">
              {counts[k]}
            </b>
          </button>
        );
      })}
    </fieldset>
  );
}
