import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState } from 'react';
import { useSessionEvents } from '@/hooks/use-session';
import { cn } from '@/lib/cn';
import type { SessionEvent } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';

interface Props {
  filePath: string;
  sessionId: string;
  onBack: () => void;
}

const ROW_HEIGHT = 56;

const eventColor: Record<string, string> = {
  user: 'text-[var(--color-accent)]',
  assistant: 'text-[var(--color-text-primary)]',
  tool_use: 'text-[var(--color-warning)]',
  tool_result: 'text-[var(--color-success)]',
  system: 'text-[var(--color-text-muted)]',
};

function eventLabel(ev: SessionEvent): string {
  if (ev.eventType === 'system' && ev.subtype) return ev.subtype;
  return ev.role ?? ev.eventType;
}

export function SessionViewer({ filePath, sessionId, onBack }: Props) {
  const events = useSessionEvents(filePath);
  const sessionSearchQuery = useUiStore((s) => s.sessionSearchQuery);
  const setSessionSearchQuery = useUiStore((s) => s.setSessionSearchQuery);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const data = events.data ?? [];
    const q = sessionSearchQuery.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (ev) =>
        ev.summary.toLowerCase().includes(q) ||
        ev.eventType.toLowerCase().includes(q) ||
        (ev.subtype?.toLowerCase().includes(q) ?? false),
    );
  }, [events.data, sessionSearchQuery]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (filtered[i]?.uuid === expandedId ? 320 : ROW_HEIGHT),
    overscan: 8,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-border)]"
        >
          ← Back
        </button>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[11px] text-[var(--color-text-primary)]">
            {sessionId}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {events.data ? `${filtered.length} of ${events.data.length} events` : 'Loading…'}
          </span>
        </div>
        <div className="ml-auto flex w-72 items-center">
          <input
            value={sessionSearchQuery}
            onChange={(e) => setSessionSearchQuery(e.target.value)}
            placeholder="Filter events…"
            className="h-8 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-3 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>
      </header>

      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {events.isLoading ? (
          <div className="p-4 text-sm text-[var(--color-text-muted)]">Loading session…</div>
        ) : events.isError ? (
          <pre className="m-4 rounded-md border border-[var(--color-danger)] p-3 text-xs text-[var(--color-danger)]">
            {String(events.error)}
          </pre>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-[var(--color-text-muted)]">No events match.</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vrow) => {
              const ev = filtered[vrow.index];
              if (!ev) return null;
              const expanded = expandedId === ev.uuid;
              return (
                <div
                  key={ev.uuid || `idx-${vrow.index}`}
                  data-index={vrow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vrow.start}px)`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : ev.uuid)}
                    className={cn(
                      'flex w-full flex-col gap-1 border-b border-[var(--color-border-subtle)] px-4 py-2.5 text-left transition-colors',
                      expanded
                        ? 'bg-[var(--color-bg-tertiary)]'
                        : 'hover:bg-[var(--color-bg-tertiary)]/50',
                    )}
                  >
                    <div className="flex items-baseline gap-2 text-[11px]">
                      <span
                        className={cn(
                          'shrink-0 font-mono uppercase',
                          eventColor[ev.eventType] ?? 'text-[var(--color-text-muted)]',
                        )}
                      >
                        {eventLabel(ev)}
                      </span>
                      <span className="shrink-0 text-[var(--color-text-muted)]">
                        {ev.timestamp ? ev.timestamp.slice(11, 19) : '—'}
                      </span>
                      <p
                        className={cn(
                          'flex-1 text-sm text-[var(--color-text-secondary)]',
                          expanded ? 'whitespace-pre-wrap' : 'truncate',
                        )}
                      >
                        {ev.summary || '(empty)'}
                      </p>
                    </div>
                    {expanded && (
                      <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-2 font-mono text-[10px] text-[var(--color-text-muted)]">
                        {JSON.stringify(ev.raw, null, 2)}
                      </pre>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
