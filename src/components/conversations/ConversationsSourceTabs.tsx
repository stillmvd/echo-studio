import { focusRing } from '@/components/memory/kinds';
import { useAgents } from '@/hooks/use-agent';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/state/ui-store';

const SOURCES = [
  [false, 'Kimi'],
  [true, 'Архив Claude'],
] as const;

export function ConversationsSourceTabs() {
  const kimi = useAgents().data?.current === 'kimi';
  const archive = useUiStore((s) => s.conversationsArchive);
  const setArchive = useUiStore((s) => s.setConversationsArchive);
  if (!kimi) return null;
  return (
    <fieldset
      aria-label="Источник переписок"
      className="mx-3 mt-3 flex shrink-0 gap-[22px] border-b border-[var(--color-border)] px-1.5"
    >
      {SOURCES.map(([value, label]) => {
        const on = archive === value;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (!on) setArchive(value);
            }}
            className={cn(
              'relative select-none rounded-md pt-1.5 pb-2.5 text-sm whitespace-nowrap',
              focusRing,
              on
                ? 'font-bold text-[var(--color-text-primary)]'
                : 'font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {label}
            {on && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--color-accent)]" />
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
