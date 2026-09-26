import { ArrowDown, ArrowUp, Check, FolderOpen, Minus, Pencil, Trash2 } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { useDeleteSession, useRenameSession } from '@/hooks/use-session-actions';
import { type AgeFilter, applyAgeFilter } from '@/lib/age-filter';
import { cn } from '@/lib/cn';
import { menuPoint } from '@/lib/context-menu';
import { revealInExplorer } from '@/lib/ipc';
import { formatBytes } from '@/lib/projects';
import {
  dayLabel,
  formatDateTime,
  formatDuration,
  formatTime,
  sessionSubject,
  splitTitle,
} from '@/lib/sessions';
import { type SessionMeta, sessionDisplayTitle } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { RenameSessionDialog } from './RenameSessionDialog';
import { SessionBulkBar } from './SessionBulkBar';

function originalTitle(s: SessionMeta): string {
  return s.customTitle?.trim() || s.aiTitle?.trim() || `${s.sessionId.slice(0, 8)}…`;
}

interface Props {
  sessions: SessionMeta[];
  isLoading: boolean;
  selectedProjectName: string | null;
}

type SortBy = 'date' | 'size' | 'duration' | 'msgs';

const columns: { key: SortBy | 'session' | 'branch'; label: string; sortable: boolean }[] = [
  { key: 'session', label: 'Session', sortable: false },
  { key: 'date', label: 'Last activity', sortable: true },
  { key: 'duration', label: 'Duration', sortable: true },
  { key: 'msgs', label: 'Msgs', sortable: true },
  { key: 'size', label: 'Size', sortable: true },
  { key: 'branch', label: 'Branch', sortable: false },
];

const narrowHidden = new Set(['duration', 'msgs', 'branch']);

const ageFilterOptions: { value: AgeFilter; short: string; label: string }[] = [
  { value: 'all', short: 'All', label: 'All sessions' },
  { value: 'older30', short: '30d+', label: 'Older than 30 days' },
  { value: 'older90', short: '90d+', label: 'Older than 90 days' },
  { value: 'older365', short: '1y+', label: 'Older than 1 year' },
];

const gridGrouped =
  'grid-cols-[minmax(0,1fr)_56px_76px_56px_72px_72px] @max-[720px]:grid-cols-[minmax(0,1fr)_56px_72px]';
const gridFlat =
  'grid-cols-[minmax(0,1fr)_108px_76px_56px_72px_72px] @max-[720px]:grid-cols-[minmax(0,1fr)_108px_72px]';

function compareSessions(a: SessionMeta, b: SessionMeta, by: SortBy): number {
  switch (by) {
    case 'date':
      return (a.lastEventAt ?? '').localeCompare(b.lastEventAt ?? '');
    case 'size':
      return a.sizeBytes - b.sizeBytes;
    case 'duration':
      return a.durationMs - b.durationMs;
    case 'msgs':
      return a.messageCount - b.messageCount;
  }
}

function CheckCircle({
  state,
  label,
  onToggle,
}: {
  state: 'off' | 'on' | 'mixed';
  label: string;
  onToggle: () => void;
}) {
  return (
    <label
      title={label}
      className="grid h-5 w-5 shrink-0 place-items-center rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-accent)]"
    >
      <input
        type="checkbox"
        aria-label={label}
        checked={state === 'on'}
        ref={(el) => {
          if (el) el.indeterminate = state === 'mixed';
        }}
        onChange={onToggle}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'grid h-[18px] w-[18px] place-items-center rounded-full transition-colors duration-120',
          state === 'off'
            ? 'shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--color-text-muted)_60%,transparent)]'
            : 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]',
        )}
      >
        {state === 'on' && <Check className="h-3 w-3" strokeWidth={3} />}
        {state === 'mixed' && <Minus className="h-3 w-3" strokeWidth={3} />}
      </span>
    </label>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center text-[13px] font-medium text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

function AgeFilterSegment({
  value,
  onChange,
}: {
  value: AgeFilter;
  onChange: (v: AgeFilter) => void;
}) {
  return (
    <fieldset className="m-0 flex h-10 shrink-0 gap-0.5 rounded-full border-0 bg-[var(--color-bg-tertiary)] p-1">
      <legend className="sr-only">Session age</legend>
      {ageFilterOptions.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.label}
          aria-label={o.label}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-8 items-center rounded-full px-3 text-xs font-medium whitespace-nowrap outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            value === o.value
              ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-[0_1px_2px_var(--color-press-shade)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
          )}
        >
          {o.short}
        </button>
      ))}
    </fieldset>
  );
}

export function SessionTable({ sessions, isLoading, selectedProjectName }: Props) {
  const sortBy = useUiStore((s) => s.conversationsSortBy);
  const sortDir = useUiStore((s) => s.conversationsSortDir);
  const setSort = useUiStore((s) => s.setConversationsSort);
  const setSelectedSessionPath = useUiStore((s) => s.setSelectedSessionPath);
  const ageFilter = useUiStore((s) => s.conversationsAgeFilter);
  const setAgeFilter = useUiStore((s) => s.setConversationsAgeFilter);
  const bulkSelection = useUiStore((s) => s.conversationsBulkSelection);
  const toggleBulkPath = useUiStore((s) => s.toggleConversationsBulkPath);
  const setBulkSelection = useUiStore((s) => s.setConversationsBulkSelection);

  const rename = useRenameSession();
  const del = useDeleteSession();
  const [menu, setMenu] = useState<{ x: number; y: number; session: SessionMeta } | null>(null);
  const [renameTarget, setRenameTarget] = useState<SessionMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SessionMeta | null>(null);

  const visible = useMemo(() => applyAgeFilter(sessions, ageFilter), [sessions, ageFilter]);

  const sorted = useMemo(() => {
    const copy = [...visible];
    copy.sort((a, b) => {
      const cmp = compareSessions(a, b, sortBy);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [visible, sortBy, sortDir]);

  const visiblePaths = useMemo(() => visible.map((s) => s.filePath), [visible]);
  const allChecked =
    visiblePaths.length > 0 && visiblePaths.every((p) => bulkSelection.includes(p));
  const someChecked = bulkSelection.length > 0 && !allChecked;
  const grouped = sortBy === 'date';
  const grid = grouped ? gridGrouped : gridFlat;

  if (selectedProjectName === null) {
    return <CenterNote>Select a project to view its sessions.</CenterNote>;
  }

  if (isLoading) {
    return (
      <CenterNote>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-glow-strong)] motion-reduce:animate-none" />
          Loading sessions…
        </span>
      </CenterNote>
    );
  }

  if (sessions.length === 0) {
    return <CenterNote>No sessions in this project.</CenterNote>;
  }

  const onHeaderClick = (col: SortBy) => {
    if (sortBy === col) {
      setSort(col, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(col, 'desc');
    }
  };

  const [lightName, boldName] = splitTitle(selectedProjectName);
  const totalSize = sessions.reduce((n, s) => n + s.sizeBytes, 0);
  const totalDuration = sessions.reduce((n, s) => n + s.durationMs, 0);
  const [sizeValue = '', sizeUnit = ''] = formatBytes(totalSize).split(' ');
  const filterLabel = ageFilterOptions.find((o) => o.value === ageFilter)?.label ?? '';
  const now = new Date();

  return (
    <>
      <div className="@container relative flex h-full flex-col gap-3 overflow-hidden px-4 pt-5">
        <div className="flex items-start justify-between gap-3 pr-1 pl-2">
          <div className="flex min-w-0 flex-col gap-3">
            <h2 className="truncate text-[28px] leading-[1.06] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
              {lightName}
              <b className="font-bold">{boldName}</b>
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {ageFilter === 'all' ? (
                <Chip value={sessions.length} unit="sessions" />
              ) : (
                <Chip value={visible.length} unit={`of ${sessions.length} sessions`} />
              )}
              <Chip value={sizeValue} unit={sizeUnit} />
              <Chip value={formatDuration(totalDuration)} unit="in total" />
            </div>
          </div>
          <AgeFilterSegment value={ageFilter} onChange={setAgeFilter} />
        </div>

        {sorted.length === 0 ? (
          <CenterNote>
            <span>No sessions {filterLabel.toLowerCase()}.</span>
            <button
              type="button"
              onClick={() => setAgeFilter('all')}
              className="rounded-full px-2 text-[var(--color-accent)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              Show all sessions
            </button>
          </CenterNote>
        ) : (
          <>
            <div className="flex h-8 shrink-0 items-center gap-2.5 px-3 text-xs font-medium text-[var(--color-text-muted)] select-none">
              <CheckCircle
                state={allChecked ? 'on' : someChecked ? 'mixed' : 'off'}
                label="Select all visible sessions"
                onToggle={() => {
                  if (allChecked || someChecked) setBulkSelection([]);
                  else setBulkSelection(visiblePaths);
                }}
              />
              <div className={cn('grid min-w-0 flex-1 items-center gap-x-3', grid)}>
                {columns.map((c) => {
                  const active = c.sortable && sortBy === c.key;
                  const hideNarrow = narrowHidden.has(c.key) && '@max-[720px]:hidden';
                  if (!c.sortable) {
                    return (
                      <span key={c.key} className={cn('truncate', hideNarrow)}>
                        {c.label}
                      </span>
                    );
                  }
                  return (
                    <span key={c.key} className={cn('min-w-0', hideNarrow)}>
                      <button
                        type="button"
                        aria-label={`Sort by ${c.label}`}
                        onClick={() => onHeaderClick(c.key as SortBy)}
                        className={cn(
                          '-ml-2 inline-flex h-[26px] max-w-full items-center gap-1 rounded-full px-2 whitespace-nowrap outline-none transition-colors duration-120 hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
                          active && 'text-[var(--color-text-primary)]',
                        )}
                      >
                        <span className="truncate">{c.label}</span>
                        {active &&
                          (sortDir === 'asc' ? (
                            <ArrowUp className="h-3 w-3 shrink-0" strokeWidth={2} />
                          ) : (
                            <ArrowDown className="h-3 w-3 shrink-0" strokeWidth={2} />
                          ))}
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>

            <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-20 select-none">
              {sorted.map((s, i) => {
                const checked = bulkSelection.includes(s.filePath);
                const menuOpen = menu?.session.sessionId === s.sessionId;
                const titled = Boolean(s.userTitle || s.customTitle || s.aiTitle);
                const day = dayLabel(s.lastEventAt, now);
                const prev = sorted[i - 1];
                const showDay =
                  grouped && (!prev || dayLabel(prev.lastEventAt, now).key !== day.key);
                return (
                  <Fragment key={s.sessionId}>
                    {showDay && (
                      <li
                        className={cn(
                          'shrink-0 px-3 pb-1 text-xs font-medium text-[var(--color-text-muted)]',
                          i === 0 ? 'pt-0.5' : 'pt-3.5',
                        )}
                      >
                        {day.lead ? (
                          <>
                            <b className="font-bold text-[var(--color-text-primary)]">{day.lead}</b>
                            {` · ${day.date}`}
                          </>
                        ) : (
                          day.date
                        )}
                      </li>
                    )}
                    <li
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({ ...menuPoint(e), session: s });
                      }}
                      className={cn(
                        'flex h-11 shrink-0 items-center gap-2.5 rounded-full px-3 transition-colors duration-120 has-[:focus-visible]:shadow-[inset_0_0_0_2px_var(--color-accent)]',
                        checked
                          ? 'bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-bg-secondary))]'
                          : menuOpen
                            ? 'bg-[var(--color-hover)]'
                            : 'hover:bg-[var(--color-hover)]',
                      )}
                    >
                      <CheckCircle
                        state={checked ? 'on' : 'off'}
                        label={`Select session ${s.sessionId.slice(0, 8)}`}
                        onToggle={() => toggleBulkPath(s.filePath)}
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedSessionPath(s.filePath)}
                        title={`${sessionDisplayTitle(s)}\n${s.sessionId}`}
                        className={cn(
                          'group grid min-w-0 flex-1 items-center gap-x-3 self-stretch text-left text-[13px] font-medium text-[var(--color-text-muted)] tabular-nums outline-none',
                          grid,
                        )}
                      >
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span
                            className={cn(
                              'min-w-0 truncate',
                              titled
                                ? 'text-sm font-normal text-[var(--color-text-primary)]'
                                : 'font-mono text-xs',
                            )}
                          >
                            {sessionDisplayTitle(s)}
                          </span>
                          {titled && (
                            <span className="shrink-0 font-mono text-[11px]">
                              {s.sessionId.slice(0, 8)}
                            </span>
                          )}
                          {s.userTitle && (
                            <span className="inline-flex h-[18px] shrink-0 items-center self-center rounded-full bg-[var(--color-accent-soft)] px-[7px] text-[11px] text-[var(--color-accent)]">
                              renamed
                            </span>
                          )}
                        </span>
                        <span className="truncate">
                          {grouped ? formatTime(s.lastEventAt) : formatDateTime(s.lastEventAt, now)}
                        </span>
                        <span className="truncate @max-[720px]:hidden">
                          {s.lastEventAt ? formatDuration(s.durationMs) : '—'}
                        </span>
                        <span className="truncate @max-[720px]:hidden">{s.messageCount}</span>
                        <span className="truncate">{formatBytes(s.sizeBytes)}</span>
                        <span className="min-w-0 @max-[720px]:hidden">
                          {s.gitBranch ? (
                            <span
                              className={cn(
                                'inline-flex h-[22px] max-w-full items-center truncate rounded-full px-2 font-mono text-[11px]',
                                checked
                                  ? 'bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]'
                                  : 'bg-[var(--color-bg-tertiary)] group-hover:bg-[var(--color-bg-secondary)]',
                              )}
                            >
                              <span className="truncate">{s.gitBranch}</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </span>
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          </>
        )}

        <SessionBulkBar sessions={sessions} visiblePaths={visiblePaths} />
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Rename',
              icon: <Pencil className="h-3.5 w-3.5" />,
              onSelect: () => setRenameTarget(menu.session),
            },
            {
              label: 'Show in Explorer',
              icon: <FolderOpen className="h-3.5 w-3.5" />,
              onSelect: () => {
                revealInExplorer(menu.session.filePath).catch(() => {});
              },
            },
            'separator',
            {
              label: 'Delete',
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
              onSelect: () => setDeleteTarget(menu.session),
            },
          ]}
        />
      )}

      <RenameSessionDialog
        open={!!renameTarget}
        initialValue={renameTarget?.userTitle ?? ''}
        fallbackTitle={renameTarget ? originalTitle(renameTarget) : ''}
        busy={rename.isPending}
        onCancel={() => setRenameTarget(null)}
        onSubmit={(title) => {
          if (!renameTarget) return;
          rename.mutate(
            { sessionId: renameTarget.sessionId, title },
            { onSuccess: () => setRenameTarget(null) },
          );
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete conversation?"
        description="The .jsonl file will be removed from disk. This cannot be undone via this app."
        subject={deleteTarget ? sessionSubject(deleteTarget) : null}
        confirmLabel="Delete"
        busy={del.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          del.mutate(deleteTarget.filePath, { onSuccess: () => setDeleteTarget(null) });
        }}
      />
    </>
  );
}
