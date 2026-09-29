import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronDown, CircleAlert, Folder, LayoutGrid, Search, X } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMemorySearch } from '@/hooks/use-memory';
import { cn } from '@/lib/cn';
import { revealInExplorer } from '@/lib/ipc';
import {
  INDEX_LIMIT,
  indexTooLong,
  type KindFilter,
  kindKey,
  MEMORY_KINDS,
  matchesRecord,
  plural,
  type StatusFilter,
  sortRecords,
} from '@/lib/memory';
import { splitTitle } from '@/lib/sessions';
import type { MemoryListing, MemoryProject, MemoryRecord, SessionNote } from '@/lib/types';
import { guardMemory, type MemoryTab, useUiStore } from '@/state/ui-store';
import { focusRing, KIND_VIEW } from './kinds';
import { HitRow, RecordRow, SessionRow } from './MemoryRows';

const RECORD = 60;
const SESSION = 64;
const HIT = 88;
const GAP = 2;

type Row =
  | { type: 'record'; record: MemoryRecord }
  | { type: 'session'; note: SessionNote }
  | { type: 'hit'; index: number };

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 pb-20 text-center text-[13px] font-medium text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('rounded-full px-2 text-[var(--color-accent)] hover:underline', focusRing)}
    >
      {children}
    </button>
  );
}

function SearchField({ hits }: { hits: number | null }) {
  const query = useUiStore((s) => s.memoryQuery);
  const setQuery = useUiStore((s) => s.setMemoryQuery);
  return (
    <label className="flex h-10 w-[220px] shrink-0 items-center gap-2 rounded-full bg-[var(--color-bg-primary)] pr-1.5 pl-4 shadow-[inset_0_1px_3px_var(--color-press-shade)] focus-within:outline-2 focus-within:outline-[var(--color-accent)] @max-[560px]:w-[180px]">
      <Search className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" strokeWidth={1.75} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQuery('');
        }}
        placeholder="Поиск по памяти…"
        aria-label="Поиск по памяти"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
      />
      {query && (
        <>
          {hits !== null && (
            <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-[var(--color-bg-tertiary)] px-[9px] text-[11px] font-medium whitespace-nowrap text-[var(--color-text-muted)] tabular-nums">
              {hits}
            </span>
          )}
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => setQuery('')}
            className={cn(
              'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]',
              focusRing,
            )}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </>
      )}
    </label>
  );
}

const TAB_ITEMS: [MemoryTab, string][] = [
  ['records', 'Записи'],
  ['sessions', 'Сессии'],
  ['archive', 'Архив'],
];

function Tabs({
  value,
  counts,
  idBase,
  onChange,
}: {
  value: MemoryTab;
  counts: Record<MemoryTab, number>;
  idBase: string;
  onChange: (t: MemoryTab) => void;
}) {
  const refs = useRef<Partial<Record<MemoryTab, HTMLButtonElement | null>>>({});
  const move = (e: React.KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % TAB_ITEMS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TAB_ITEMS.length) % TAB_ITEMS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TAB_ITEMS.length - 1;
    else return;
    e.preventDefault();
    const target = TAB_ITEMS[next];
    if (!target) return;
    onChange(target[0]);
    refs.current[target[0]]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Разделы памяти"
      className="flex gap-[22px] border-b border-[var(--color-border)] px-1.5"
    >
      {TAB_ITEMS.map(([id, label], index) => {
        const on = value === id;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el;
            }}
            id={`${idBase}-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${idBase}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(e) => move(e, index)}
            className={cn(
              'relative rounded-md pt-1.5 pb-2.5 text-sm',
              focusRing,
              on
                ? 'font-bold text-[var(--color-text-primary)]'
                : 'font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {label}
            <i className="ml-[5px] text-[11px] tabular-nums opacity-80 not-italic">{counts[id]}</i>
            {on && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[var(--color-accent)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function StatusSegment({
  value,
  counts,
  onChange,
}: {
  value: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (v: StatusFilter) => void;
}) {
  const items: [StatusFilter, string][] = [
    ['all', 'Все'],
    ['fact', 'Факты'],
    ['observation', 'Наблюдения'],
    ['stale', 'Устаревшие'],
  ];
  return (
    <fieldset
      aria-label="Статус"
      className="m-0 flex min-w-0 gap-0.5 overflow-hidden rounded-full border-0 bg-[var(--color-bg-tertiary)] p-1"
    >
      {items.map(([id, label]) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-200 ease-[var(--ease-trail)]',
              focusRing,
              on
                ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-[0_1px_2px_var(--color-press-shade)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
            )}
          >
            {label}
            <i className="text-[11px] tabular-nums opacity-80 not-italic">{counts[id]}</i>
          </button>
        );
      })}
    </fieldset>
  );
}

function KindDropdown({
  value,
  counts,
  onChange,
}: {
  value: KindFilter;
  counts: Record<KindFilter, number>;
  onChange: (v: KindFilter) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const kinds: KindFilter[] = ['all', ...MEMORY_KINDS, 'other'];
  const items: ContextMenuItem[] = kinds.map((k) => {
    const view = k === 'all' ? null : KIND_VIEW[k];
    const Icon = view?.Icon ?? LayoutGrid;
    return {
      label: `${view?.label ?? 'все'} · ${counts[k]}`,
      icon:
        k === value ? (
          <Check className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        ),
      onSelect: () => onChange(k),
    };
  });
  const current = value === 'all' ? 'все' : KIND_VIEW[value].label;
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 6 });
        }}
        className={cn(
          'inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-[var(--color-bg-tertiary)] pr-3 pl-3.5 text-[13px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] active:scale-[.97]',
          focusRing,
        )}
      >
        <LayoutGrid className="h-4 w-4 text-[var(--color-accent)]" strokeWidth={1.75} />
        Вид: {current}
        <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.75} />
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </>
  );
}

function IndexWarning({ lines }: { lines: number }) {
  return (
    <div className="mx-1 flex min-h-10 items-center gap-2.5 rounded-2xl bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] px-3.5 py-2 text-[12.5px] leading-[1.4] font-medium text-[var(--color-warning)]">
      <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span>
        <b className="font-bold">MEMORY.md — {lines} строк</b>, Claude Code грузит первые{' '}
        {INDEX_LIMIT}. Остальные записи Claude не увидит.
      </span>
    </div>
  );
}

function countLine(project: MemoryProject, archived: number) {
  const parts: React.ReactNode[] = [];
  const add = (n: number, text: string) => {
    if (n > 0) {
      parts.push(
        <span key={text}>
          <b className="font-bold text-[var(--color-text-primary)]">{n}</b> {text}
        </span>,
      );
    }
  };
  add(project.records, plural(project.records, 'запись', 'записи', 'записей'));
  add(project.facts, plural(project.facts, 'факт', 'факта', 'фактов'));
  add(project.sessions, plural(project.sessions, 'сессия', 'сессии', 'сессий'));
  add(archived, 'в архиве');
  return parts.flatMap((p, i) => (i === 0 ? [p] : [' · ', p]));
}

export function MemoryList({
  project,
  projects,
  listing,
  isLoading,
  error,
  selectedPath,
  onSelect,
  onRetry,
}: {
  project: MemoryProject;
  projects: MemoryProject[];
  listing: MemoryListing | undefined;
  isLoading: boolean;
  error: unknown;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  onRetry: () => void;
}) {
  const tab = useUiStore((s) => s.memoryTab);
  const setTabRaw = useUiStore((s) => s.setMemoryTab);
  const setTab = (next: MemoryTab) => {
    if (next !== useUiStore.getState().memoryTab) guardMemory(() => setTabRaw(next));
  };
  const status = useUiStore((s) => s.memoryStatus);
  const setStatus = useUiStore((s) => s.setMemoryStatus);
  const kind = useUiStore((s) => s.memoryKind);
  const setKind = useUiStore((s) => s.setMemoryKind);
  const query = useUiStore((s) => s.memoryQuery);
  const setQuery = useUiStore((s) => s.setMemoryQuery);
  const openRecord = useUiStore((s) => s.openMemoryRecord);

  const idBase = useId();
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, 250);
  const typed = trimmed.length >= 2;
  const searching = typed && debounced.length >= 2;
  const search = useMemorySearch(debounced, null);
  const hits = useMemo(() => (typed ? (search.data ?? []) : []), [typed, search.data]);
  const searchWaiting =
    !searching || (hits.length === 0 && (trimmed !== debounced || search.isFetching));

  const records = listing?.records ?? [];
  const sessions = listing?.sessions ?? [];
  const archived = listing?.archived ?? [];

  const statusCounts = useMemo(() => {
    const n = (s: StatusFilter) =>
      records.filter((r) => matchesRecord(r, { kind, status: s, query })).length;
    return { all: n('all'), fact: n('fact'), observation: n('observation'), stale: n('stale') };
  }, [records, kind, query]);
  const kindCounts = useMemo(() => {
    const out: Record<KindFilter, number> = {
      all: 0,
      other: 0,
      decision: 0,
      gotcha: 0,
      bugfix: 0,
      feature: 0,
      discovery: 0,
    };
    for (const r of records) {
      if (!matchesRecord(r, { kind: 'all', status, query })) continue;
      out.all += 1;
      out[kindKey(r.kind)] += 1;
    }
    return out;
  }, [records, status, query]);

  const rows = useMemo<Row[]>(() => {
    if (typed) return hits.map((_, index) => ({ type: 'hit', index }));
    const q = query.trim().toLowerCase();
    if (tab === 'sessions') {
      return [...sessions]
        .filter((n) => !q || `${n.title}\n${n.next ?? ''}`.toLowerCase().includes(q))
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .map((note) => ({ type: 'session', note }));
    }
    if (tab === 'archive') {
      return [...archived]
        .filter((r) => matchesRecord(r, { kind: 'all', status: 'all', query }))
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .map((record) => ({ type: 'record', record }));
    }
    return sortRecords(records.filter((r) => matchesRecord(r, { kind, status, query }))).map(
      (record) => ({ type: 'record', record }),
    );
  }, [typed, hits, tab, sessions, archived, records, kind, status, query]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (i) => {
      const row = rows[i];
      if (!row) return i;
      if (row.type === 'record') return row.record.path;
      if (row.type === 'session') return row.note.path;
      const hit = hits[row.index];
      return hit ? `${hit.slug}:${hit.path}:${hit.line}:${row.index}` : i;
    },
    estimateSize: (i) => {
      const row = rows[i];
      const size = row?.type === 'session' ? SESSION : row?.type === 'hit' ? HIT : RECORD;
      return size + GAP;
    },
    overscan: 8,
  });

  const projectName = (slug: string) => projects.find((p) => p.slug === slug)?.name ?? slug;
  const hitProjects = new Set(hits.map((h) => h.slug)).size;
  const [lead, last] = splitTitle(project.name);
  const archivedCount = listing ? archived.length : project.archived;
  const noMemory =
    !isLoading && !error && project.records === 0 && project.sessions === 0 && archivedCount === 0;

  let body: React.ReactNode = null;
  if (typed) {
    if (searchWaiting) body = <CenterNote>Ищу…</CenterNote>;
    else if (search.error) {
      body = (
        <CenterNote>
          <span className="text-[var(--color-danger)]">{String(search.error)}</span>
        </CenterNote>
      );
    } else if (hits.length === 0) {
      body = (
        <CenterNote>
          <span>Ничего не найдено по «{debounced}»</span>
          <LinkButton onClick={() => setQuery('')}>Очистить поиск</LinkButton>
        </CenterNote>
      );
    }
  } else if (isLoading) {
    body = (
      <CenterNote>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)] motion-reduce:animate-none" />
          Читаю память…
        </span>
      </CenterNote>
    );
  } else if (error) {
    body = (
      <CenterNote>
        <span className="max-w-[520px] rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 font-mono text-xs leading-normal font-normal [overflow-wrap:anywhere] text-[var(--color-danger)]">
          {String(error)}
        </span>
        <LinkButton onClick={onRetry}>Повторить</LinkButton>
      </CenterNote>
    );
  } else if (noMemory) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-4 pb-[88px] text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] text-[var(--color-text-muted)]">
          <Folder className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <h3 className="text-[22px] leading-[1.06] font-light tracking-[-0.02em]">
          В {project.name} пока <b className="font-bold">нет памяти</b>
        </h3>
        <p className="max-w-[420px] text-[13px] font-medium text-[var(--color-text-muted)]">
          Записи появятся, когда Claude Code начнёт сохранять заметки в{' '}
          <span className="font-mono text-xs [overflow-wrap:anywhere]">{project.memoryDir}</span>.
          Раздел покажет их здесь.
        </p>
        <button
          type="button"
          onClick={() => {
            revealInExplorer(project.memoryDir).catch(() => {});
          }}
          className={cn(
            'inline-flex h-9 items-center rounded-full bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] px-4 text-[13px] font-medium hover:bg-[var(--color-hover)] active:scale-[.96]',
            focusRing,
          )}
        >
          Открыть папку проекта
        </button>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <CenterNote>
        {tab === 'sessions' ? (
          <span className="max-w-[360px]">
            Заметок сессий пока нет. Они появляются, когда плагин echo-memory закрывает сессию.
          </span>
        ) : tab === 'archive' ? (
          <span>Архив пуст</span>
        ) : query || status !== 'all' || kind !== 'all' ? (
          <>
            <span>Записей с такими условиями нет</span>
            <LinkButton
              onClick={() => {
                setQuery('');
                setStatus('all');
                setKind('all');
              }}
            >
              Сбросить фильтры
            </LinkButton>
          </>
        ) : (
          <span>Записей пока нет</span>
        )}
      </CenterNote>
    );
  }

  const list = body ? null : (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-[88px]">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index];
          if (!row) return null;
          let node: React.ReactNode = null;
          if (row.type === 'record') {
            const path = row.record.path;
            node = (
              <RecordRow
                record={row.record}
                selected={selectedPath === path}
                onSelect={() => onSelect(selectedPath === path ? null : path)}
              />
            );
          } else if (row.type === 'session') {
            const path = row.note.path;
            node = (
              <SessionRow
                note={row.note}
                selected={selectedPath === path}
                onSelect={() => onSelect(selectedPath === path ? null : path)}
              />
            );
          } else {
            const hit = hits[row.index];
            if (hit) {
              node = (
                <HitRow
                  hit={hit}
                  projectName={projectName(hit.slug)}
                  query={debounced}
                  onOpen={() => guardMemory(() => openRecord(hit.slug, hit.path))}
                />
              );
            }
          }
          return (
            <div
              key={v.key}
              className="absolute inset-x-0"
              style={{ top: v.start, height: v.size - GAP }}
            >
              {node}
            </div>
          );
        })}
      </div>
    </div>
  );

  const showTabs = !typed && !noMemory;

  return (
    <div className="@container flex h-full flex-col gap-3.5 overflow-hidden px-4 pt-5">
      <div className="flex items-start justify-between gap-3 pr-1 pl-2">
        <div className="flex min-w-0 flex-col gap-2.5">
          <h2 className="min-w-0 text-[28px] leading-[1.06] font-light tracking-[-0.02em] [overflow-wrap:anywhere] text-[var(--color-text-primary)]">
            {searching ? (
              <>
                Поиск <b className="font-bold">по всей памяти</b>
              </>
            ) : (
              <>
                {lead}
                <b className="font-bold">{last}</b>
              </>
            )}
          </h2>
          {searching ? (
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              <b className="font-bold text-[var(--color-text-primary)]">{hits.length}</b>{' '}
              {plural(hits.length, 'совпадение', 'совпадения', 'совпадений')} в{' '}
              <b className="font-bold text-[var(--color-text-primary)]">{hitProjects}</b>{' '}
              {plural(hitProjects, 'проекте', 'проектах', 'проектах')}
            </span>
          ) : (
            <>
              <span className="font-mono text-xs [overflow-wrap:anywhere] text-[var(--color-text-muted)]">
                {project.memoryDir}
              </span>
              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                {countLine(project, archivedCount)}
              </span>
            </>
          )}
        </div>
        <SearchField hits={searching ? hits.length : null} />
      </div>
      {!typed && indexTooLong(project.indexLines) && <IndexWarning lines={project.indexLines} />}
      {showTabs && (
        <div className="px-1">
          <Tabs
            value={tab}
            idBase={idBase}
            counts={{
              records: listing ? records.length : project.records,
              sessions: listing ? sessions.length : project.sessions,
              archive: archivedCount,
            }}
            onChange={setTab}
          />
        </div>
      )}
      <div
        {...(showTabs
          ? { role: 'tabpanel', id: `${idBase}-panel`, 'aria-labelledby': `${idBase}-tab-${tab}` }
          : {})}
        className="flex min-h-0 flex-1 flex-col gap-3.5"
      >
        {showTabs && tab === 'records' && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-1">
            <StatusSegment value={status} counts={statusCounts} onChange={setStatus} />
            <KindDropdown value={kind} counts={kindCounts} onChange={setKind} />
          </div>
        )}
        {body}
        {list}
      </div>
    </div>
  );
}
