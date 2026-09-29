import { Folder } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { MemoryProject } from '@/lib/types';
import { focusRing } from './kinds';

interface Props {
  projects: MemoryProject[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}

function ProjectRow({
  project,
  selected,
  onClick,
}: {
  project: MemoryProject;
  selected: boolean;
  onClick: () => void;
}) {
  const empty = project.records === 0 && project.sessions === 0;
  return (
    <li className="shrink-0">
      <button
        type="button"
        title={project.cwd ?? project.memoryDir}
        aria-current={selected ? 'true' : undefined}
        onClick={onClick}
        className={cn(
          'flex h-11 w-full items-center gap-2.5 rounded-full pr-1.5 pl-3.5 text-left text-sm transition-colors duration-200 ease-[var(--ease-trail)]',
          focusRing,
          selected
            ? 'bg-[var(--color-text-primary)] font-bold text-[var(--color-bg-primary)]'
            : cn(
                'hover:bg-[var(--color-hover)]',
                empty
                  ? 'font-medium text-[var(--color-text-muted)]'
                  : 'font-medium text-[var(--color-text-primary)]',
              ),
        )}
      >
        <Folder
          className={cn(
            'h-4 w-4 shrink-0',
            selected ? 'text-[var(--color-bg-primary)]' : 'text-[var(--color-text-muted)]',
          )}
          strokeWidth={1.75}
        />
        <span className={cn('min-w-0 flex-1 truncate', empty && !selected && 'opacity-60')}>
          {project.name}
        </span>
        <span
          className={cn(
            'inline-flex h-6 shrink-0 items-center rounded-full px-[9px] text-[11px] font-medium tabular-nums',
            selected
              ? 'bg-[color-mix(in_srgb,var(--color-bg-primary)_16%,transparent)] text-[color-mix(in_srgb,var(--color-bg-primary)_62%,transparent)]'
              : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
          )}
        >
          {project.records}
        </span>
      </button>
    </li>
  );
}

export function MemoryProjectPanel({ projects, selectedSlug, onSelect }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 pt-5 pb-3">
      <h2 className="px-2 text-[22px] leading-[1.06] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
        All <b className="font-bold">memory</b>
      </h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {projects.map((p) => (
          <ProjectRow
            key={p.slug}
            project={p}
            selected={p.slug === selectedSlug}
            onClick={() => onSelect(p.slug)}
          />
        ))}
      </ul>
    </div>
  );
}
