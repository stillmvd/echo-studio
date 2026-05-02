import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { EmptyDetail } from '@/components/memories/EmptyDetail';
import { MemoryDetail } from '@/components/memories/MemoryDetail';
import { MemoryList } from '@/components/memories/MemoryList';
import { ProjectSidebar } from '@/components/memories/ProjectSidebar';
import { useMemoriesList, useMemoryDetail } from '@/hooks/use-memories';
import { useUiStore } from '@/state/ui-store';

export function MemoriesLayout() {
  const selectedProject = useUiStore((s) => s.selectedProject);
  const selectedCategory = useUiStore((s) => s.selectedCategory);
  const status = useUiStore((s) => s.status);
  const selectedMemoryId = useUiStore((s) => s.selectedMemoryId);

  const list = useMemoriesList({
    project: selectedProject ?? undefined,
    category: selectedCategory ?? undefined,
    status,
    limit: 1000,
  });
  const detail = useMemoryDetail(selectedMemoryId);

  if (list.isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <pre className="max-w-2xl whitespace-pre-wrap rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] p-4 text-xs text-[var(--color-danger)]">
          {String(list.error)}
        </pre>
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" autoSaveId="echo-studio.memories.panel-sizes">
      <Panel defaultSize={20} minSize={15} className="bg-[var(--color-bg-secondary)]">
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

      <PanelResizeHandle className="w-px bg-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-accent)] data-[resize-handle-state=drag]:bg-[var(--color-accent)]" />

      <Panel defaultSize={35} minSize={25} className="bg-[var(--color-bg-primary)]">
        <MemoryList
          items={list.data?.items ?? []}
          total={list.data?.total ?? 0}
          isLoading={list.isLoading}
        />
      </Panel>

      <PanelResizeHandle className="w-px bg-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-accent)] data-[resize-handle-state=drag]:bg-[var(--color-accent)]" />

      <Panel defaultSize={45} minSize={30} className="bg-[var(--color-bg-primary)]">
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
    </PanelGroup>
  );
}
