import { useEffect, useState } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCrossSessionSearch } from '@/hooks/use-session';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/state/ui-store';

interface Props {
  projectId: string | null;
}

export function CrossSessionSearch({ projectId }: Props) {
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

  return (
    <div className="flex shrink-0 flex-col border-b border-[var(--color-border-subtle)]">
      <div className="px-3 py-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={projectId ? 'Search across sessions…' : 'Select a project first'}
          disabled={!projectId}
          className={cn(
            'h-8 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-3 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none',
            !projectId && 'cursor-not-allowed opacity-50',
          )}
        />
      </div>

      {projectId && draft.trim() && (
        <div className="max-h-64 overflow-y-auto px-2 pb-2">
          {results.isLoading ? (
            <p className="px-2 py-1 text-[10px] text-[var(--color-text-muted)]">Searching…</p>
          ) : results.data && results.data.length > 0 ? (
            <ul className="space-y-1">
              {results.data.slice(0, 50).map((h) => (
                <li key={`${h.sessionId}:${h.uuid}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSessionPath(h.filePath);
                      setSessionSearchQuery(debounced);
                    }}
                    className="flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/60"
                  >
                    <span className="line-clamp-2 text-xs">{h.preview}</span>
                    <span className="font-mono text-[9px] text-[var(--color-text-muted)]">
                      {h.kind} · {h.sessionId.slice(0, 8)}…
                      {h.timestamp && ` · ${h.timestamp.slice(0, 16).replace('T', ' ')}`}
                    </span>
                  </button>
                </li>
              ))}
              {results.data.length > 50 && (
                <li className="px-2 py-1 text-[10px] text-[var(--color-text-muted)]">
                  + {results.data.length - 50} more (refine query to narrow)
                </li>
              )}
            </ul>
          ) : (
            <p className="px-2 py-1 text-[10px] text-[var(--color-text-muted)]">No matches.</p>
          )}
        </div>
      )}
    </div>
  );
}
