import { ArrowDownWideNarrow, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { cn } from '@/lib/cn';
import { formatAgo, formatBytes, parentFolder, sortProjects } from '@/lib/projects';
import type { ConversationProject } from '@/lib/types';
import { type ProjectSort, useUiStore } from '@/state/ui-store';

interface Props {
  projects: ConversationProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const sortOptions: { id: ProjectSort; label: string }[] = [
  { id: 'recent', label: 'Recent activity' },
  { id: 'name', label: 'Name' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'size', label: 'Size' },
];

function Chip({ value, unit }: { value: string | number; unit: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-[var(--color-bg-tertiary)] px-[9px] text-[11px] font-medium text-[var(--color-text-muted)] tabular-nums">
      <b className="mr-1 font-bold text-[var(--color-text-primary)]">{value}</b>
      {unit}
    </span>
  );
}

function SortButton() {
  const sort = useUiStore((s) => s.projectsSort);
  const setSort = useUiStore((s) => s.setProjectsSort);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <button
        type="button"
        title="Sort projects"
        aria-label="Sort projects"
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 6 });
        }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] transition-colors duration-200 hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
      >
        <ArrowDownWideNarrow className="h-4 w-4" strokeWidth={1.75} />
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={sortOptions.map((o) => ({
            label: o.label,
            icon: o.id === sort ? <Check className="h-3.5 w-3.5" /> : <span />,
            onSelect: () => setSort(o.id),
          }))}
        />
      )}
    </>
  );
}

export function ConversationsProjectSidebar({ projects, selectedId, onSelect }: Props) {
  const sort = useUiStore((s) => s.projectsSort);
  const sorted = useMemo(() => sortProjects(projects, sort), [projects, sort]);
  const totalSize = projects.reduce((s, p) => s + p.totalSize, 0);
  const totalSessions = projects.reduce((s, p) => s + p.sessionCount, 0);
  const [sizeValue = '', sizeUnit = ''] = formatBytes(totalSize).split(' ');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-3.5 px-2 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[22px] leading-[1.06] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
            All <b className="font-bold">projects</b>
          </h2>
          <SortButton />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip value={projects.length} unit="projects" />
          <Chip value={totalSessions} unit="sessions" />
          <Chip value={sizeValue} unit={sizeUnit} />
        </div>
      </div>

      {projects.length === 0 ? (
        <p className="px-2 text-xs text-[var(--color-text-muted)]">
          No conversations found in ~/.claude/projects/
        </p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {sorted.map((p) => {
            const selected = selectedId === p.id;
            const parent = parentFolder(p.cwd);
            return (
              <li key={p.id} className="shrink-0">
                <button
                  type="button"
                  title={p.cwd}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelect(p.id)}
                  className={cn(
                    'grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-full pr-1.5 pl-4 text-left text-sm transition-[height,background-color,color] duration-200 ease-[var(--ease-trail)] motion-reduce:transition-none',
                    selected
                      ? 'h-[52px] bg-[var(--color-text-primary)] font-bold text-[var(--color-bg-primary)]'
                      : 'h-11 text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]',
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate leading-[1.2]">{p.displayName}</span>
                    {parent && (
                      <span
                        aria-hidden={!selected}
                        className={cn(
                          'truncate text-xs leading-[1.2] font-medium text-[color-mix(in_srgb,var(--color-bg-primary)_62%,transparent)] transition-[max-height,opacity] duration-200 ease-[var(--ease-trail)] motion-reduce:transition-none',
                          selected ? 'max-h-4 opacity-100' : 'max-h-0 opacity-0',
                        )}
                      >
                        {parent}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums',
                      selected
                        ? 'text-[color-mix(in_srgb,var(--color-bg-primary)_62%,transparent)]'
                        : 'text-[var(--color-text-muted)]',
                    )}
                  >
                    {formatAgo(p.lastActivity)}
                  </span>
                  <span
                    className={cn(
                      'inline-flex h-[26px] min-w-7 items-center justify-center rounded-full px-[9px] text-xs font-medium tabular-nums',
                      selected
                        ? 'bg-[color-mix(in_srgb,var(--color-bg-primary)_16%,transparent)] text-[var(--color-bg-primary)]'
                        : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
                    )}
                  >
                    {p.sessionCount}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
