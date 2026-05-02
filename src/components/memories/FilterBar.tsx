import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import type { SearchMode, SortBy, TagCount } from '@/lib/types';
import { type DateRangePreset, useUiStore } from '@/state/ui-store';

interface Props {
  tags: TagCount[];
  semanticWarning: string | null;
  modeUsed: SearchMode | null;
}

const modes: { value: SearchMode; label: string; title: string }[] = [
  { value: 'lexical', label: 'Lex', title: 'Lexical (FTS5)' },
  { value: 'semantic', label: 'Sem', title: 'Semantic (Ollama embeddings)' },
  { value: 'hybrid', label: 'Hyb', title: 'Hybrid (RRF merge)' },
];

const dateRanges: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'last7', label: '7d' },
  { value: 'last30', label: '30d' },
  { value: 'last90', label: '90d' },
];

const sortOptions: { value: SortBy; label: string }[] = [
  { value: 'updatedDesc', label: 'Updated ↓' },
  { value: 'createdDesc', label: 'Created ↓' },
  { value: 'titleAsc', label: 'Title ↑' },
  { value: 'projectAsc', label: 'Project ↑' },
];

export function FilterBar({ tags, semanticWarning, modeUsed }: Props) {
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const searchMode = useUiStore((s) => s.searchMode);
  const setSearchMode = useUiStore((s) => s.setSearchMode);
  const selectedTags = useUiStore((s) => s.selectedTags);
  const toggleTag = useUiStore((s) => s.toggleTag);
  const clearTags = useUiStore((s) => s.clearTags);
  const dateRange = useUiStore((s) => s.dateRange);
  const setDateRange = useUiStore((s) => s.setDateRange);
  const sortBy = useUiStore((s) => s.sortBy);
  const setSortBy = useUiStore((s) => s.setSortBy);

  const [draft, setDraft] = useState(searchQuery);

  useEffect(() => {
    setDraft(searchQuery);
  }, [searchQuery]);

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSearchQuery(e.target.value);
            }}
            placeholder="Search title, what, why, impact, tags…"
            className="h-8 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] pl-3 pr-8 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft('');
                setSearchQuery('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <Segmented
          value={searchMode}
          options={modes}
          onChange={setSearchMode}
          renderTitle={(o) => o.title}
        />

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="h-8 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 text-xs text-[var(--color-text-secondary)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="shrink-0 text-[var(--color-text-muted)]">Date:</span>
        <Segmented value={dateRange} options={dateRanges} onChange={setDateRange} />
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.slice(0, 30).map((t) => {
            const active = selectedTags.includes(t.tag);
            return (
              <button
                type="button"
                key={t.tag}
                onClick={() => toggleTag(t.tag)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                    : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border)]',
                )}
              >
                #{t.tag}
                <span className="text-[var(--color-text-muted)]">{t.count}</span>
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={clearTags}
              className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              Clear ({selectedTags.length})
            </button>
          )}
        </div>
      )}

      {semanticWarning && (
        <div className="rounded-sm border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-2 py-1 text-[11px] text-[var(--color-warning)]">
          {semanticWarning}
        </div>
      )}

      {modeUsed && modeUsed !== searchMode && (
        <div className="text-[10px] text-[var(--color-text-muted)]">
          Effective mode: <span className="text-[var(--color-text-secondary)]">{modeUsed}</span>
        </div>
      )}
    </div>
  );
}

function Segmented<V extends string, O extends { value: V; label: string }>({
  value,
  options,
  onChange,
  renderTitle,
}: {
  value: V;
  options: O[];
  onChange: (v: V) => void;
  renderTitle?: (o: O) => string;
}) {
  return (
    <div className="flex shrink-0 gap-0.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          title={renderTitle?.(o)}
          className={cn(
            'rounded-sm px-2 py-0.5 text-[11px] transition-colors',
            value === o.value
              ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
