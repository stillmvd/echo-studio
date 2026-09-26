import { cn } from '@/lib/cn';
import { highlightSegments } from '@/lib/tooling';
import type { ToolItem } from '@/lib/types';
import { KIND_META } from './kinds';
import { hasToggle, RowToggle } from './ToolToggle';

function Highlight({ text, query }: { text: string; query: string }) {
  let offset = 0;
  return (
    <>
      {highlightSegments(text, query).map((s) => {
        const key = offset;
        offset += s.text.length;
        return s.hit ? (
          <mark
            key={key}
            className="rounded-[4px] bg-[var(--color-accent-soft)] text-inherit shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]"
          >
            {s.text}
          </mark>
        ) : (
          <span key={key}>{s.text}</span>
        );
      })}
    </>
  );
}

export function describeTool(item: ToolItem): string {
  if (item.kind === 'mcp' && item.mcp) {
    return `${item.mcp.transport} · ${item.mcp.command ?? item.mcp.url ?? ''}`;
  }
  return item.description ?? '';
}

type Tone = 'mono' | 'warn' | 'danger' | 'mine';

function tags(item: ToolItem): { text: string; tone?: Tone }[] {
  const out: { text: string; tone?: Tone }[] = [];
  if (item.origin === 'project' || item.origin === 'local')
    out.push({ text: item.origin, tone: 'mine' });
  if (item.overriddenBy) out.push({ text: `overridden by ${item.overriddenBy}`, tone: 'warn' });
  if (item.kind === 'plugin' && item.plugin?.version) {
    out.push({ text: item.plugin.version, tone: 'mono' });
  }
  if (item.origin === 'plugin' && item.kind !== 'plugin' && item.pluginKey) {
    out.push({ text: item.pluginKey.split('@')[0] ?? item.pluginKey });
  }
  if (item.overrideMode) out.push({ text: item.overrideMode, tone: 'warn' });
  if (item.state === 'unavailable') out.push({ text: 'plugin off' });
  if (item.state === 'error') out.push({ text: 'error', tone: 'danger' });
  return out;
}

export function ToolRow({
  item,
  query,
  selected,
  onSelect,
}: {
  item: ToolItem;
  query: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = KIND_META[item.kind].icon;
  const name = item.kind === 'plugin' ? item.name : item.qualifiedName;
  const dim = item.state === 'disabled' || item.state === 'unavailable';
  const nested = item.conflict === 'overridden';

  return (
    <div
      className={cn(
        'relative flex w-full items-center transition-colors duration-200 ease-[var(--ease-trail)] select-none has-[>button:first-child:focus-visible]:ring-2 has-[>button:first-child:focus-visible]:ring-[var(--color-accent)]',
        nested
          ? 'ml-12 h-11 w-[calc(100%-3rem)] rounded-full opacity-70'
          : 'h-[60px] rounded-[20px]',
        selected
          ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
          : 'text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]',
        dim && !selected && 'opacity-55',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        title={item.error ?? undefined}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 self-stretch pl-2.5 text-left outline-none',
          hasToggle(item) ? 'pr-[60px]' : 'pr-3',
        )}
      >
        <span
          className={cn(
            'grid shrink-0 place-items-center rounded-full',
            nested ? 'h-7 w-7' : 'h-9 w-9',
            selected
              ? 'bg-[color-mix(in_srgb,var(--color-bg-primary)_16%,transparent)] text-[color-mix(in_srgb,var(--color-bg-primary)_62%,transparent)]'
              : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
          )}
        >
          <Icon className={nested ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-bold">
            <Highlight text={name} query={query} />
          </span>
          <span
            className={cn(
              'truncate text-xs font-medium',
              selected
                ? 'text-[color-mix(in_srgb,var(--color-bg-primary)_62%,transparent)]'
                : 'text-[var(--color-text-muted)]',
            )}
          >
            {nested && <span className="text-[var(--color-warning)]">overridden · </span>}
            <Highlight text={describeTool(item)} query={query} />
          </span>
        </span>
        <span className="flex shrink-0 gap-1.5">
          {tags(item).map((t) => (
            <span
              key={t.text}
              className={cn(
                'inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap',
                selected
                  ? 'bg-[color-mix(in_srgb,var(--color-bg-primary)_16%,transparent)] text-[color-mix(in_srgb,var(--color-bg-primary)_70%,transparent)]'
                  : t.tone === 'danger'
                    ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                    : t.tone === 'mine'
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-text-primary)]'
                      : cn(
                          'bg-[var(--color-bg-tertiary)]',
                          t.tone === 'warn'
                            ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-text-muted)]',
                        ),
                t.tone === 'mono' && 'font-mono font-normal',
              )}
            >
              {t.text}
            </span>
          ))}
        </span>
      </button>
      <RowToggle item={item} className="absolute top-1/2 right-3 -translate-y-1/2" />
    </div>
  );
}
