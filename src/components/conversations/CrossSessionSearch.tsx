import { Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useConversationSessions } from '@/hooks/use-conversations';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCrossSessionSearch } from '@/hooks/use-session';
import { cn } from '@/lib/cn';
import { formatShortDateTime } from '@/lib/projects';
import { sessionDisplayTitle } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';

const VISIBLE_HITS = 50;

interface Props {
  projectId: string | null;
  children: ReactNode;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let offset = 0;
  const parts = text
    .split(new RegExp(`(${escaped})`, 'gi'))
    .map((part, i) => {
      const start = offset;
      offset += part.length;
      return { part, start, match: i % 2 === 1 };
    })
    .filter(({ part }) => part.length > 0);
  return (
    <>
      {parts.map(({ part, start, match }) =>
        match ? (
          <mark
            key={start}
            className="rounded-[4px] bg-[var(--color-accent-soft)] px-0.5 text-[var(--color-text-primary)] shadow-[inset_0_0_0_1px_rgb(255_162_76/45%)]"
          >
            {part}
          </mark>
        ) : (
          <span key={start}>{part}</span>
        ),
      )}
    </>
  );
}

export function CrossSessionSearch({ projectId, children }: Props) {
  const cross = useUiStore((s) => s.crossSessionSearchQuery);
  const setCross = useUiStore((s) => s.setCrossSessionSearchQuery);
  const setSelectedSessionPath = useUiStore((s) => s.setSelectedSessionPath);
  const setSessionSearchQuery = useUiStore((s) => s.setSessionSearchQuery);

  const [draft, setDraft] = useState(cross);
  const debounced = useDebouncedValue(draft, 350);

  useEffect(() => {
    setCross(debounced);
  }, [debounced, setCross]);

  useEffect(() => {
    setDraft(cross);
  }, [cross]);

  const results = useCrossSessionSearch(projectId, debounced);
  const sessions = useConversationSessions(projectId);
  const titles = useMemo(
    () => new Map((sessions.data ?? []).map((s) => [s.sessionId, sessionDisplayTitle(s)])),
    [sessions.data],
  );

  const query = draft.trim();
  const searching = projectId !== null && query.length > 0;
  const hits = results.data ?? [];
  const sessionCount = new Set(hits.map((h) => h.sessionId)).size;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-4 pb-3">
      <label
        className={cn(
          'flex h-11 shrink-0 items-center gap-2.5 rounded-full bg-[var(--color-bg-primary)] pr-1.5 pl-[18px] shadow-[inset_0_1px_3px_var(--color-press-shade)] focus-within:outline-2 focus-within:outline-[var(--color-accent)]',
          !projectId && 'opacity-50',
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.75} />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && draft) {
              e.stopPropagation();
              setDraft('');
            }
          }}
          aria-label="Search across sessions"
          placeholder={projectId ? 'Search across sessions' : 'Select a project first'}
          disabled={!projectId}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus-visible:outline-none disabled:cursor-not-allowed"
        />
        {draft && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setDraft('')}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] transition-colors duration-200 hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </label>

      {searching ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <p className="px-2 text-xs font-medium text-[var(--color-text-muted)] tabular-nums">
            {results.isLoading || debounced.trim() !== query ? (
              'Searching…'
            ) : hits.length === 0 ? (
              'No matches'
            ) : (
              <>
                <b className="font-bold text-[var(--color-text-primary)]">{hits.length}</b>{' '}
                {hits.length === 1 ? 'match' : 'matches'} in{' '}
                <b className="font-bold text-[var(--color-text-primary)]">{sessionCount}</b>{' '}
                {sessionCount === 1 ? 'session' : 'sessions'}
              </>
            )}
          </p>
          <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {hits.slice(0, VISIBLE_HITS).map((h) => (
              <li key={`${h.sessionId}:${h.uuid}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSessionPath(h.filePath);
                    setSessionSearchQuery(debounced);
                  }}
                  className="flex w-full flex-col gap-1.5 rounded-[20px] bg-[var(--color-bg-tertiary)] px-3.5 py-3 text-left transition-colors duration-200 hover:bg-[var(--color-hover)]"
                >
                  <span className="line-clamp-2 font-mono text-xs leading-[1.45] break-all text-[var(--color-text-primary)]">
                    <Highlight text={h.preview} query={query} />
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)]">
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--color-bg-secondary)] px-2">
                      {h.kind}
                    </span>
                    <span className="min-w-0 truncate">
                      {titles.get(h.sessionId) ?? `${h.sessionId.slice(0, 8)}…`}
                    </span>
                    {h.timestamp && (
                      <span className="ml-auto shrink-0 tabular-nums">
                        {formatShortDateTime(h.timestamp)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            {hits.length > VISIBLE_HITS && (
              <li className="shrink-0 px-2 text-xs text-[var(--color-text-muted)]">
                +{hits.length - VISIBLE_HITS} more — refine the query
              </li>
            )}
          </ul>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
