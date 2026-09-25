import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Group, Panel, useDefaultLayout } from 'react-resizable-panels';
import { BulkActionBar } from '@/components/memories/BulkActionBar';
import { ClaudeCodeDialog } from '@/components/memories/ClaudeCodeDialog';
import { EmptyDetail } from '@/components/memories/EmptyDetail';
import { FilterBar } from '@/components/memories/FilterBar';
import { MemoryDetail } from '@/components/memories/MemoryDetail';
import { MemoryList } from '@/components/memories/MemoryList';
import { ProjectSidebar } from '@/components/memories/ProjectSidebar';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMemoriesList, useMemoryDetail } from '@/hooks/use-memories';
import { dateFromPreset } from '@/lib/date-range';
import { tokenizeQuery } from '@/lib/highlight';
import { useUiStore } from '@/state/ui-store';
import { PanelSeparator, panelCard } from './panels';

function ScreenTitle({ text }: { text: string }) {
  const cut = text.search(/[\s_-]/);
  if (cut < 0) return <b className="font-bold">{text}</b>;
  return (
    <>
      {text.slice(0, cut + 1)}
      <b className="font-bold">{text.slice(cut + 1)}</b>
    </>
  );
}

export function MemoriesLayout() {
  const layout = useDefaultLayout({
    id: 'echo-studio.memories.panel-sizes',
    storage: localStorage,
  });
  const selectedProject = useUiStore((s) => s.selectedProject);
  const [newOpen, setNewOpen] = useState(false);
  const selectedCategory = useUiStore((s) => s.selectedCategory);
  const status = useUiStore((s) => s.status);
  const selectedMemoryId = useUiStore((s) => s.selectedMemoryId);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const searchMode = useUiStore((s) => s.searchMode);
  const selectedTags = useUiStore((s) => s.selectedTags);
  const setSelectedTags = useUiStore((s) => s.setSelectedTags);
  const dateRange = useUiStore((s) => s.dateRange);
  const sortBy = useUiStore((s) => s.sortBy);

  const debouncedQuery = useDebouncedValue(searchQuery, 300);
  const dateFrom = dateFromPreset(dateRange);

  const list = useMemoriesList({
    project: selectedProject ?? undefined,
    category: selectedCategory ?? undefined,
    status,
    limit: 1000,
    query: debouncedQuery || undefined,
    mode: debouncedQuery ? searchMode : undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    dateFrom,
    sortBy,
  });
  const detail = useMemoryDetail(selectedMemoryId);

  // biome-ignore lint/correctness/useExhaustiveDependencies: prune stale selected tags after refetch
  useEffect(() => {
    if (!list.data || selectedTags.length === 0) return;
    const available = new Set(list.data.tags.map((t) => t.tag));
    const fresh = selectedTags.filter((t) => available.has(t));
    if (fresh.length !== selectedTags.length) {
      setSelectedTags(fresh);
    }
  }, [list.data?.tags, selectedTags]);

  if (list.isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <pre className="max-w-2xl whitespace-pre-wrap rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] p-4 text-xs text-[var(--color-danger)]">
          {String(list.error)}
        </pre>
      </div>
    );
  }

  const highlightTerms = debouncedQuery ? tokenizeQuery(debouncedQuery) : [];

  return (
    <Group orientation="horizontal" {...layout}>
      <Panel defaultSize="20" minSize="15" className={panelCard}>
        {list.data ? (
          <ProjectSidebar
            projects={list.data.projects}
            categories={list.data.categories}
            total={list.data.total}
            memoryHome={list.data.memoryHome}
            homeSource={list.data.homeSource}
          />
        ) : (
          <div className="p-4 text-sm text-[var(--color-text-muted)]">Loading…</div>
        )}
      </Panel>

      <PanelSeparator />

      <Panel defaultSize="35" minSize="25" className={panelCard}>
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex shrink-0 items-end justify-between gap-4 px-6 pt-6 pb-3">
            <div className="min-w-0">
              <h2 className="truncate text-[28px] leading-[1.06] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
                <ScreenTitle text={selectedProject ?? 'All memories'} />
              </h2>
              <span className="text-[13px] font-medium text-[var(--color-text-muted)] tabular-nums">
                {list.data ? `${list.data.total} memories` : '…'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              title="Create a new memory via Claude Code"
              className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-[var(--color-accent)] pr-[18px] pl-3.5 text-sm font-bold whitespace-nowrap text-[var(--color-accent-fg)] shadow-[0_0_16px_var(--color-glow),inset_0_1px_0_rgb(255_255_255/30%)] transition-[box-shadow,transform] duration-200 ease-[var(--ease-trail)] hover:shadow-[0_0_22px_var(--color-glow-strong),inset_0_1px_0_rgb(255_255_255/30%)] active:scale-96 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              New memory
            </button>
          </div>
          <FilterBar
            tags={list.data?.tags ?? []}
            semanticWarning={list.data?.semanticWarning ?? null}
            modeUsed={list.data?.modeUsed ?? null}
          />
          <BulkActionBar />
          <div className="flex-1 overflow-hidden">
            <MemoryList
              items={list.data?.items ?? []}
              total={list.data?.total ?? 0}
              isLoading={list.isLoading || list.isFetching}
              highlightTerms={highlightTerms}
            />
          </div>
        </div>
      </Panel>

      <PanelSeparator />

      <Panel defaultSize="45" minSize="30" className={panelCard}>
        {selectedMemoryId === null ? (
          <EmptyDetail message="Select a memory to see details." />
        ) : detail.isLoading ? (
          <EmptyDetail message="Loading…" />
        ) : detail.data ? (
          <MemoryDetail data={detail.data} />
        ) : (
          <EmptyDetail message="Memory not found." />
        )}
      </Panel>
      <ClaudeCodeDialog
        open={newOpen}
        initialTemplate="save"
        memory={null}
        defaultProject={selectedProject}
        defaultCwd=""
        onClose={() => setNewOpen(false)}
      />
    </Group>
  );
}
