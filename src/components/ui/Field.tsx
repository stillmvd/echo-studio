import { useId } from 'react';
import { cn } from '@/lib/cn';

export const fieldSurface =
  'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] outline-none transition-[background-color,box-shadow] duration-200 ease-[var(--ease-trail)] placeholder:text-[var(--color-text-muted)] focus:bg-[var(--color-bg-primary)] focus:shadow-[inset_0_0_0_1.5px_var(--color-accent)] disabled:opacity-60';

export const fieldInput = cn(
  'h-11 w-full rounded-full px-[18px] text-sm font-medium',
  fieldSurface,
);

export const fieldArea = cn(
  'w-full resize-y rounded-[20px] px-[18px] py-3 text-sm leading-normal font-medium',
  fieldSurface,
);

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="pl-1 text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </label>
      {children(id)}
      {hint && (
        <span className="pl-1 text-xs font-medium text-[var(--color-text-muted)]">{hint}</span>
      )}
    </div>
  );
}
