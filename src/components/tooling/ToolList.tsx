import { useVirtualizer } from '@tanstack/react-virtual';
import { CircleAlert, Search, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { cn } from '@/lib/cn';
import { splitTitle } from '@/lib/sessions';
import { countByKind, filterTools, nestOverrides } from '@/lib/tooling';
import type { ScanResult, ScopeRef } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { KIND_META } from './kinds';
import { ToolRow } from './ToolRow';
import { TypeFilter } from './TypeFilter';

const ROW = 60;
const NESTED = 44;
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
  isProject,
  duplicatesOnly,
  onDuplicates,
}: {
  items: ScanResult['items'];
  isProject: boolean;
  duplicatesOnly: boolean;
  onDuplicates: () => void;
}) {
  const duplicates = items.filter((i) => i.conflict === 'sameName').length;
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
  const base = useMemo(() => {
    const scoped = projectOnly
      ? filterTools(sorted, { kind: 'all', query: '', projectOnly })
      : sorted;
    return duplicatesOnly ? scoped.filter((i) => i.conflict === 'sameName') : scoped;
  }, [sorted, projectOnly, duplicatesOnly]);
  const matching = useMemo(() => filterTools(base, { kind: 'all', query }), [base, query]);
  const counts = useMemo(() => countByKind(matching), [matching]);
  const visible = useMemo(
    () => nestOverrides(type === 'all' ? matching : matching.filter((i) => i.kind === type)),
    [matching, type],
  );
  const failed = (scan?.sources ?? []).filter((s) => s.status === 'error');

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => visible[index]?.id ?? index,
    estimateSize: (index) => (visible[index]?.conflict === 'overridden' ? NESTED : ROW) + GAP,
    overscan: 8,
  });

  const [lightName, boldName] = splitTitle(scope.name);

  let body: React.ReactNode;
  if (!scope.available) {
    body = (
      <CenterNote>
        <span>This project folder no longer exists.</span>
        <span className="font-mono text-xs font-normal [overflow-wrap:anywhere]">{scope.path}</span>
      </CenterNote>
    );
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
            const item = visible[v.index];
            if (!item) return null;
            return (
              <div
                key={item.id}
                className="absolute inset-x-0"
                style={{ top: v.start, height: v.size - GAP }}
              >
                <ToolRow
                  item={item}
                  query={query}
                  selected={selectedId === item.id}
                  onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
                />
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
