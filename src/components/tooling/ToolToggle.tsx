import { useIsMutating } from '@tanstack/react-query';
import { Power } from 'lucide-react';
import { TOGGLE_KEY, useSetToolEnabled } from '@/hooks/use-tooling';
import { cn } from '@/lib/cn';
import type { ToolItem } from '@/lib/types';

export function canToggle(item: ToolItem): boolean {
  return item.toggle !== null && (item.state === 'enabled' || item.state === 'disabled');
}

export function useToggleTool(item: ToolItem) {
  const mutation = useSetToolEnabled();
  const busy = useIsMutating({ mutationKey: TOGGLE_KEY }) > 0;
  const on = item.state === 'enabled';
  return {
    on,
    busy,
    toggle: () => {
      if (busy || !item.toggle || !canToggle(item)) return;
      mutation.mutate({ id: item.id, target: item.toggle, enabled: !on });
    },
  };
}

function Switch({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <span
      className={cn(
        'relative h-[22px] w-9 shrink-0 rounded-full transition-colors duration-200 ease-[var(--ease-trail)]',
        on
          ? 'bg-[var(--color-accent)]'
          : 'bg-[var(--color-bg-tertiary)] shadow-[inset_0_0_0_1px_var(--color-border)]',
        disabled && 'opacity-40',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] left-[3px] h-4 w-4 rounded-full transition-transform duration-200 ease-[var(--ease-trail)] motion-reduce:transition-none',
          on ? 'translate-x-3.5 bg-[var(--color-accent-fg)]' : 'bg-[var(--color-text-muted)]',
        )}
      />
    </span>
  );
}

const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-0';

export function hasToggle(item: ToolItem): boolean {
  return canToggle(item) || item.toggleHint !== null;
}

export function RowToggle({ item, className }: { item: ToolItem; className?: string }) {
  const { on, busy, toggle } = useToggleTool(item);
  const name = item.kind === 'plugin' ? item.name : item.qualifiedName;
  if (!canToggle(item)) {
    if (!item.toggleHint) return null;
    return (
      <span title={item.toggleHint} className={cn('grid shrink-0 place-items-center', className)}>
        <Switch on={on} disabled />
      </span>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${on ? 'Turn off' : 'Turn on'} ${name}`}
      onClick={toggle}
      disabled={busy}
      className={cn(
        'grid shrink-0 place-items-center rounded-full disabled:cursor-progress',
        focusRing,
        className,
      )}
    >
      <Switch on={on} />
    </button>
  );
}

export function DetailToggle({ item }: { item: ToolItem }) {
  const { on, busy, toggle } = useToggleTool(item);
  if (!canToggle(item)) {
    if (!item.toggleHint) return null;
    return (
      <span
        title={item.toggleHint}
        className="inline-flex h-10 items-center gap-2.5 text-[13px] font-medium whitespace-nowrap text-[var(--color-text-muted)]"
      >
        <Switch on={on} disabled />
        Can't turn off
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2.5">
      {item.toggle?.projectPath && (
        <span className="text-xs font-medium whitespace-nowrap text-[var(--color-text-muted)] @max-[440px]:hidden">
          for this project
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-full pr-[18px] pl-3.5 text-[13px] font-bold whitespace-nowrap active:scale-[.96] disabled:cursor-progress',
          on
            ? 'bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]'
            : 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:brightness-105',
          focusRing,
        )}
      >
        <Power className="h-3.5 w-3.5" strokeWidth={2} />
        {on ? 'Turn off' : 'Turn on'}
      </button>
    </span>
  );
}
