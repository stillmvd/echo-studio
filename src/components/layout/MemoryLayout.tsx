import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, useDefaultLayout } from 'react-resizable-panels';
import { MemoryDetail } from '@/components/memory/MemoryDetail';
import { MemoryList } from '@/components/memory/MemoryList';
import { MemoryProjectPanel } from '@/components/memory/MemoryProjectPanel';
import { UndoToast } from '@/components/memory/UndoToast';
import {
  useMemoryListing,
  useMemoryProjects,
  useMemoryWatch,
  useRestoreMemoryRecord,
} from '@/hooks/use-memory';
import { cn } from '@/lib/cn';
import { guardMemory, useUiStore } from '@/state/ui-store';
import { PanelSeparator, panelCard } from './panels';

interface Archived {
  id: number;
  name: string;
  archivedPath: string;
}

interface ToastState {
  stamp: number;
  items: Archived[];
  error: string | null;
}

const MAX_UNDO = 3;

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 pb-20 text-center text-[13px] font-medium text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

export function MemoryLayout() {
  useMemoryWatch();
  const slug = useUiStore((s) => s.memorySlug);
  const setSlugRaw = useUiStore((s) => s.setMemorySlug);
  const selectedPath = useUiStore((s) => s.selectedMemoryPath);
  const setSelectedPathRaw = useUiStore((s) => s.setSelectedMemoryPath);
  const dirty = useUiStore((s) => s.memoryDirty);
  const setSlug = useCallback(
    (next: string) => {
      if (next !== useUiStore.getState().memorySlug) guardMemory(() => setSlugRaw(next));
    },
    [setSlugRaw],
  );
  const setSelectedPath = useCallback(
    (next: string | null) => guardMemory(() => setSelectedPathRaw(next)),
    [setSelectedPathRaw],
  );
  const layout = useDefaultLayout({ id: 'echo-studio.memory.panel-sizes', storage: localStorage });

  const projectsQuery = useMemoryProjects();
  const projects = useMemo(
    () =>
      [...(projectsQuery.data ?? [])].sort(
        (a, b) =>
          Number(b.records > 0 || b.sessions > 0) - Number(a.records > 0 || a.sessions > 0) ||
          b.records - a.records ||
          a.name.localeCompare(b.name),
      ),
    [projectsQuery.data],
  );
  const project = projects.find((p) => p.slug === slug) ?? projects[0] ?? null;
  const listing = useMemoryListing(project?.slug ?? null);

  const record = useMemo(() => {
    if (!selectedPath || !listing.data) return null;
    return (
      listing.data.records.find((r) => r.path === selectedPath) ??
      listing.data.archived.find((r) => r.path === selectedPath) ??
      null
    );
  }, [listing.data, selectedPath]);
  const note = useMemo(
    () => listing.data?.sessions.find((n) => n.path === selectedPath) ?? null,
    [listing.data, selectedPath],
  );
  const close = useCallback(() => setSelectedPathRaw(null), [setSelectedPathRaw]);

  const seenPath = useRef<string | null>(null);
  const found = record !== null || note !== null;
  useEffect(() => {
    if (found) seenPath.current = selectedPath;
  }, [found, selectedPath]);
  const stale =
    selectedPath !== null &&
    listing.data !== undefined &&
    !listing.isFetching &&
    !found &&
    seenPath.current === selectedPath;
  useEffect(() => {
    if (stale && !dirty) setSelectedPathRaw(null);
  }, [stale, dirty, setSelectedPathRaw]);

  const restore = useRestoreMemoryRecord();
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const onArchived = useCallback((name: string, archivedPath: string) => {
    const stamp = Date.now();
    setToast((t) => ({
      stamp,
      error: null,
      items: [...(t?.items ?? []), { id: stamp, name, archivedPath }].slice(-MAX_UNDO),
    }));
  }, []);
  const undo = () => {
    const last = toast?.items[toast.items.length - 1];
    if (!last) return;
    restore.mutate(last.archivedPath, {
      onSuccess: () =>
        setToast((t) => {
          const items = (t?.items ?? []).filter((i) => i.id !== last.id);
          return items.length === 0 ? null : { stamp: Date.now(), error: null, items };
        }),
      onError: (e) => setToast((t) => (t ? { ...t, error: String(e) } : t)),
    });
  };

  let main: React.ReactNode;
  if (projectsQuery.isLoading) {
    main = (
      <CenterNote>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)] motion-reduce:animate-none" />
          Читаю память…
        </span>
      </CenterNote>
    );
  } else if (projectsQuery.error) {
    main = (
      <CenterNote>
        <span className="max-w-[520px] rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 font-mono text-xs leading-normal font-normal [overflow-wrap:anywhere] text-[var(--color-danger)]">
          {String(projectsQuery.error)}
        </span>
        <button
          type="button"
          onClick={() => void projectsQuery.refetch()}
          className="rounded-full px-2 text-[var(--color-accent)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Повторить
        </button>
      </CenterNote>
    );
  } else if (!project) {
    main = (
      <CenterNote>
        <span>Память Claude Code пока не найдена ни в одном проекте.</span>
      </CenterNote>
    );
  } else {
    main = (
      <MemoryList
        project={project}
        projects={projects}
        listing={listing.data}
        isLoading={listing.isLoading}
        error={listing.error}
        selectedPath={selectedPath}
        onSelect={setSelectedPath}
        onRetry={() => void listing.refetch()}
      />
    );
  }

  const showDetail = project !== null && selectedPath !== null;

  return (
    <>
      <Group orientation="horizontal" {...layout}>
        <Panel defaultSize="24" minSize="18" className={panelCard}>
          <MemoryProjectPanel
            projects={projects}
            selectedSlug={project?.slug ?? null}
            onSelect={setSlug}
          />
        </Panel>

        <PanelSeparator />

        <Panel defaultSize="76" minSize="40">
          <div className="@container h-full min-w-0">
            <div
              className={
                showDetail
                  ? 'relative grid h-full grid-cols-[minmax(240px,1fr)_minmax(360px,40%)] gap-2 @max-[640px]:grid-cols-1'
                  : 'grid h-full grid-cols-1'
              }
            >
              <div className={panelCard}>{main}</div>
              {showDetail && (
                <div
                  className={cn(
                    panelCard,
                    '@max-[640px]:absolute @max-[640px]:inset-0 @max-[640px]:z-10',
                  )}
                >
                  <MemoryDetail
                    key={selectedPath}
                    path={selectedPath}
                    record={record}
                    note={note}
                    removed={stale}
                    projects={projects}
                    currentSlug={project.slug}
                    onClose={close}
                    onArchived={onArchived}
                  />
                </div>
              )}
            </div>
          </div>
        </Panel>
      </Group>
      {toast && (
        <UndoToast
          key={`${toast.stamp}:${toast.error ?? ''}`}
          message={
            toast.items.length > 1
              ? `В архиве: ${toast.items.length}`
              : `Запись «${toast.items[0]?.name ?? ''}» в архиве`
          }
          error={toast.error}
          busy={restore.isPending}
          onUndo={undo}
          onDismiss={dismissToast}
        />
      )}
    </>
  );
}
