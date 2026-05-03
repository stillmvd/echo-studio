import { useEffect, useState } from 'react';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import type { SearchMode, SortBy, TagCount } from '@/lib/types';
import { type DateRangePreset, useUiStore } from '@/state/ui-store';

interface Props {
  tags: TagCount[];
  semanticWarning: string | null;
  modeUsed: SearchMode | null;
}

const dateRangeOptions: { value: DateRangePreset; label: string }[] = [
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
  const selectedTags = useUiStore((s) => s.selectedTags);
  const toggleTag = useUiStore((s) => s.toggleTag);
  const clearTags = useUiStore((s) => s.clearTags);
  const dateRange = useUiStore((s) => s.dateRange);
  const setDateRange = useUiStore((s) => s.setDateRange);
  const sortBy = useUiStore((s) => s.sortBy);
  const setSortBy = useUiStore((s) => s.setSortBy);
  const tagsExpanded = useUiStore((s) => s.tagsExpanded);
  const toggleTagsExpanded = useUiStore((s) => s.toggleTagsExpanded);

  const [draft, setDraft] = useState(searchQuery);

  useEffect(() => {
    setDraft(searchQuery);
  }, [searchQuery]);

  const tagsCount = tags.length;
  const showTagsHeader = tagsCount > 0 || selectedTags.length > 0;

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

        <Select value={dateRange} options={dateRangeOptions} onChange={setDateRange} />
        <Select value={sortBy} options={sortOptions} onChange={setSortBy} />
      </div>

      {showTagsHeader && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={toggleTagsExpanded}
            className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden="true"
              className={cn('transition-transform', tagsExpanded && 'rotate-90')}
            >
              <path
                d="M3.5 2.5l3 2.5-3 2.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Tags ({tagsCount})
            {selectedTags.length > 0 && (
              <span className="rounded-full bg-[var(--color-accent)]/20 px-1.5 py-0.5 text-[9px] text-[var(--color-accent)]">
                {selectedTags.length} active
              </span>
            )}
          </button>

          {tagsExpanded && (
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.slice(0, 60).map((t) => {
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
                  Clear
                </button>
              )}
            </div>
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
