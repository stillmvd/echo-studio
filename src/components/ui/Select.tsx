import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface SelectOption<V extends string> {
  value: V;
  label: string;
}

interface Props<V extends string> {
  value: V;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  className?: string;
  align?: 'left' | 'right';
}

export function Select<V extends string>({
  value,
  options,
  onChange,
  className,
  align = 'left',
}: Props<V>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 pr-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none"
      >
        <span className="truncate">{current?.label ?? '—'}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-30 mt-1 min-w-full overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <ul className="py-1">
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors',
                    o.value === value
                      ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/60',
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      aria-hidden="true"
                      className="shrink-0 text-[var(--color-accent)]"
                    >
                      <path
                        d="M2 5l2.5 2.5L8.5 3"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
