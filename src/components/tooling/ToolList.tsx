import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, CircleAlert, Search, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useConversationProjects } from '@/hooks/use-conversations';
import { cn } from '@/lib/cn';
import { splitTitle } from '@/lib/sessions';
import {
  countByKind,
  filterTools,
  groupSkills,
  nestOverrides,
  samePath,
  type ToolRowModel,
} from '@/lib/tooling';
import type { ScanResult, ScopeRef } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { KIND_META } from './kinds';
import { ToolRow } from './ToolRow';
import { TypeFilter } from './TypeFilter';

const ROW = 60;
const NESTED = 44;
const GROUP = 36;
const GAP = 2;
const SORT_RANK = { skill: 0, plugin: 1, mcp: 2, command: 3, agent: 4 } as const;

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 pb-20 text-center text-[13px] font-medium text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

function Tiles({ counts }: { counts: Record<string, number> }) {
  const kinds = ['skill', 'plugin', 'mcp', 'command', 'agent'] as const;
  return (
    <div className="grid grid-cols-5 gap-2 @max-[560px]:grid-cols-3">
      {kinds.map((k) => (
        <span
          key={k}
          className="flex min-w-0 flex-col gap-0.5 rounded-[20px] bg-[var(--color-bg-tertiary)] px-3 py-2.5"
        >
          <b className="text-[22px] leading-[1.1] font-light tracking-[-0.02em] text-[var(--color-text-primary)] tabular-nums">
            {counts[k] ?? 0}
          </b>
          <span className="truncate text-[11px] font-medium text-[var(--color-text-muted)]">
            {KIND_META[k].label}
          </span>
        </span>
      ))}
    </div>
  );
}

function SearchField({ total, shown }: { total: number; shown: number }) {
  const query = useUiStore((s) => s.toolsQuery);
  const setQuery = useUiStore((s) => s.setToolsQuery);
  return (
    <label className="ml-auto flex h-10 w-[220px] shrink-0 items-center gap-2 rounded-full bg-[var(--color-bg-primary)] pr-1.5 pl-4 shadow-[inset_0_1px_3px_var(--color-press-shade)] focus-within:outline-2 focus-within:outline-[var(--color-accent)] @max-[560px]:ml-0 @max-[560px]:w-full">
      <Search className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.75} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQuery('');
        }}
        placeholder="Search tools"
        aria-label="Search tools"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
      />
      {query && (
        <>
          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-[var(--color-bg-tertiary)] px-[9px] text-[11px] font-medium whitespace-nowrap text-[var(--color-text-muted)] tabular-nums">
            {shown} of {total}
          </span>
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </>
      )}
    </label>
  );
}

function ScopeChips({
  items,
  duplicates,
  isProject,
  duplicatesOnly,
  onDuplicates,
}: {
  items: ScanResult['items'];
  duplicates: number;
  isProject: boolean;
  duplicatesOnly: boolean;
  onDuplicates: () => void;
}) {
  if (!isProject && duplicates === 0) return null;
  const own = items.filter((i) => i.origin === 'project' || i.origin === 'local').length;
  const overrides = items.filter((i) => i.conflict === 'overrides').length;
  const chip =
    'inline-flex h-6 items-center rounded-full px-[9px] text-[11px] font-medium tabular-nums';
  return (
    <div className="flex flex-wrap gap-1.5">
      {isProject && (
        <span className={`${chip} bg-[var(--color-accent-soft)] text-[var(--color-text-primary)]`}>
          <b className="mr-1 font-bold">{own}</b>from this project
        </span>
      )}
      {isProject && overrides > 0 && (
        <span
          className={`${chip} bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)]`}
        >
          <b className="mr-1 font-bold">{overrides}</b>
          {overrides === 1 ? 'override' : 'overrides'}
        </span>
      )}
      {duplicates > 0 && (
        <button
          type="button"
          aria-pressed={duplicatesOnly}
          onClick={onDuplicates}
          title={duplicatesOnly ? 'Show all tools' : 'Show only tools with the same name'}
          className={cn(
            chip,
            'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] active:scale-[.96]',
            duplicatesOnly
              ? 'bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)] shadow-[inset_0_0_0_1.5px_var(--color-warning)]'
              : 'bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)] hover:bg-[color-mix(in_srgb,var(--color-warning)_22%,transparent)]',
          )}
        >
          <b className="mr-1 font-bold">{duplicates}</b>
          {duplicates === 1 ? 'duplicate' : 'duplicates'}
        </button>
      )}
      {isProject && (
        <span className={`${chip} bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]`}>
          <b className="mr-1 font-bold text-[var(--color-text-primary)]">{items.length}</b>
          Claude sees in total
        </span>
      )}
    </div>
  );
}

function ProjectOnlyToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`inline-flex shrink-0 items-center gap-2.5 rounded-full py-1 pr-1 pl-1 text-[13px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${on ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}
    >
      <span
        className={`relative h-[22px] w-9 rounded-full transition-colors duration-200 ease-[var(--ease-trail)] ${on ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-tertiary)] shadow-[inset_0_0_0_1px_var(--color-border)]'}`}
      >
        <span
          className={`absolute top-[3px] left-[3px] h-4 w-4 rounded-full transition-transform duration-200 ease-[var(--ease-trail)] motion-reduce:transition-none ${on ? 'translate-x-3.5 bg-[var(--color-accent-fg)]' : 'bg-[var(--color-text-muted)]'}`}
        />
      </span>
      Project only
    </button>
  );
}

function GroupRow({
  row,
  onToggle,
}: {
  row: Extract<ToolRowModel, { type: 'group' }>;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={row.open}
      onClick={onToggle}
      className="flex h-full w-full items-center gap-1.5 rounded-full pr-3 pl-2.5 text-left text-xs font-medium text-[var(--color-text-muted)] outline-none select-none hover:bg-[var(--color-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center">
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200 ease-[var(--ease-trail)] motion-reduce:transition-none',
            row.open && 'rotate-90',
          )}
          strokeWidth={1.75}
        />
      </span>
      <b className="truncate font-bold text-[var(--color-text-primary)]">{row.title}</b>
      {row.origin === 'plugin' && (
        <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--color-bg-tertiary)] px-2 text-[11px]">
          plugin
        </span>
      )}
      <span className="shrink-0 tabular-nums">{row.count}</span>
    </button>
  );
}

function MissingScope({ path }: { path: string }) {
  const projects = useConversationProjects();
  const setProjectId = useUiStore((s) => s.setConversationsProjectId);
  const setTab = useUiStore((s) => s.setActiveTab);
  const project = projects.data?.find((p) => samePath(p.cwd, path));
  const sessions = project?.sessionCount ?? 0;
  return (
    <CenterNote>
      <span>This project folder no longer exists.</span>
      <span className="font-mono text-xs font-normal [overflow-wrap:anywhere]">{path}</span>
      {!projects.isLoading &&
        (project && sessions > 0 ? (
          <button
            type="button"
            onClick={() => {
              setProjectId(project.id);
              setTab('conversations');
            }}
            className="mt-2 inline-flex h-10 items-center rounded-full bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] px-[18px] text-[13px] font-bold text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] active:scale-[.96]"
          >
            Open {sessions} {sessions === 1 ? 'session' : 'sessions'} in Conversations
          </button>
        ) : (
          <span className="mt-2">No sessions</span>
        ))}
    </CenterNote>
  );
}

export function ToolList({
  scope,
  scan,
  isLoading,
  error,
  compact,
  onRetry,
}: {
  scope: ScopeRef;
  scan: ScanResult | undefined;
  isLoading: boolean;
  error: unknown;
  compact: boolean;
  onRetry: () => void;
}) {
  const type = useUiStore((s) => s.toolsType);
  const setType = useUiStore((s) => s.setToolsType);
  const query = useUiStore((s) => s.toolsQuery);
  const setQuery = useUiStore((s) => s.setToolsQuery);
  const selectedId = useUiStore((s) => s.selectedToolId);
  const setSelectedId = useUiStore((s) => s.setSelectedToolId);
  const projectOnlyPref = useUiStore((s) => s.toolsProjectOnly);
  const setProjectOnly = useUiStore((s) => s.setToolsProjectOnly);
  const duplicatesOnly = useUiStore((s) => s.toolsDuplicatesOnly);
  const setDuplicatesOnly = useUiStore((s) => s.setToolsDuplicatesOnly);
  const isProject = scope.kind === 'project';
  const projectOnly = isProject && projectOnlyPref;

  const sorted = useMemo(
    () =>
      [...(scan?.items ?? [])].sort(
        (a, b) =>
          SORT_RANK[a.kind] - SORT_RANK[b.kind] || a.qualifiedName.localeCompare(b.qualifiedName),
      ),
    [scan],
  );
  const scoped = useMemo(
    () => (projectOnly ? filterTools(sorted, { kind: 'all', query: '', projectOnly }) : sorted),
    [sorted, projectOnly],
  );
  const duplicates = useMemo(() => scoped.filter((i) => i.conflict !== 'none'), [scoped]);
  const base = duplicatesOnly ? duplicates : scoped;
  const matching = useMemo(() => filterTools(base, { kind: 'all', query }), [base, query]);
  const counts = useMemo(() => countByKind(matching), [matching]);
  const visible = useMemo(
    () => nestOverrides(type === 'all' ? matching : matching.filter((i) => i.kind === type)),
    [matching, type],
  );
  const openGroups = useUiStore((s) => s.toolsOpenGroups);
  const toggleGroup = useUiStore((s) => s.toggleToolsGroup);
  const rows = useMemo<ToolRowModel[]>(
    () =>
      type === 'skill'
        ? groupSkills(
            base.filter((i) => i.kind === 'skill'),
            visible,
            new Set(openGroups),
            query.trim() !== '',
          )
        : visible.map((item) => ({ type: 'item', item, grouped: false })),
    [type, base, visible, openGroups, query],
  );
  const failed = (scan?.sources ?? []).filter((s) => s.status === 'error');

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => {
      const row = rows[index];
      return row ? (row.type === 'group' ? row.key : row.item.id) : index;
    },
    estimateSize: (index) => {
      const row = rows[index];
      if (row?.type === 'group') return GROUP + GAP;
      return (row?.item.conflict === 'overridden' ? NESTED : ROW) + GAP;
    },
    overscan: 8,
  });

  const [lightName, boldName] = splitTitle(scope.name);

  let body: React.ReactNode;
  if (!scope.available) {
    body = <MissingScope path={scope.path ?? ''} />;
  } else if (isLoading) {
    body = (
      <CenterNote>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)] motion-reduce:animate-none" />
          Reading Claude config…
        </span>
      </CenterNote>
    );
  } else if (error) {
    body = (
      <CenterNote>
        <span className="max-w-[520px] rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 font-mono text-xs leading-normal font-normal [overflow-wrap:anywhere] text-[var(--color-danger)]">
          {String(error)}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full px-2 text-[var(--color-accent)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          Try again
        </button>
      </CenterNote>
    );
  } else if (visible.length === 0) {
    body = (
      <CenterNote>
        {query ? (
          <>
            <span>No tools match «{query}»</span>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded-full px-2 text-[var(--color-accent)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              Clear search
            </button>
          </>
        ) : (
          <span>No {KIND_META[type].label.toLowerCase()} in this scope.</span>
        )}
      </CenterNote>
    );
  } else {
    body = (
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-[88px]">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index];
            if (!row) return null;
            if (row.type === 'group') {
              return (
                <div
                  key={row.key}
                  className="absolute inset-x-0"
                  style={{ top: v.start, height: v.size - GAP }}
                >
                  <GroupRow row={row} onToggle={() => toggleGroup(row.key)} />
                </div>
              );
            }
            const { item, grouped } = row;
            const next = rows[v.index + 1];
            const lastGrouped = !(next?.type === 'item' && next.grouped);
            return (
              <div
                key={item.id}
                className={cn('absolute inset-x-0', grouped && 'pl-8')}
                style={{ top: v.start, height: grouped ? v.size : v.size - GAP }}
              >
                {grouped && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-0 left-5 w-0.5 rounded-full bg-[var(--color-border)]',
                      lastGrouped ? 'bottom-3' : 'bottom-0',
                    )}
                  />
                )}
                <div style={{ height: v.size - GAP }}>
                  <ToolRow
                    item={item}
                    query={query}
                    selected={selectedId === item.id}
                    onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="@container flex h-full flex-col gap-3.5 overflow-hidden px-4 pt-5">
      <div className="flex flex-col gap-2.5 pr-1 pl-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-[22px] leading-[1.06] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
            {lightName}
            <b className="font-bold">{boldName}</b>
          </h2>
          {isProject && scope.available && (
            <ProjectOnlyToggle on={projectOnlyPref} onChange={setProjectOnly} />
          )}
        </div>
        {scan && !isLoading && (
          <ScopeChips
            items={scan.items}
            duplicates={duplicates.length}
            isProject={isProject}
            duplicatesOnly={duplicatesOnly}
            onDuplicates={() => setDuplicatesOnly(!duplicatesOnly)}
          />
        )}
        {scan && !isLoading && !compact && <Tiles counts={scan.counts} />}
      </div>
      {scope.available && (
        <div className="flex flex-wrap items-center gap-2.5 px-1">
          <TypeFilter value={type} counts={counts} onChange={setType} />
          <SearchField
            total={type === 'all' ? base.length : base.filter((i) => i.kind === type).length}
            shown={visible.length}
          />
        </div>
      )}
      {failed.map((s) => (
        <div
          key={s.path}
          className="mx-1 flex items-start gap-2.5 rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 text-xs leading-normal text-[var(--color-danger)]"
        >
          <CircleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0">
            Couldn't read{' '}
            <code className="font-mono [overflow-wrap:anywhere]">{s.error ?? s.path}</code>.
            Everything else is shown.
          </span>
        </div>
      ))}
      {body}
    </div>
  );
}
