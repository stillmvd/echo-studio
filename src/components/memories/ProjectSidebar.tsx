import { cn } from '@/lib/cn';
import type { CategoryCount, ProjectCount } from '@/lib/types';
import { type MemoryStatus, useUiStore } from '@/state/ui-store';

interface Props {
  projects: ProjectCount[];
  categories: CategoryCount[];
  total: number;
  memoryHome: string;
  homeSource: string;
}

const statusOptions: { value: MemoryStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

export function ProjectSidebar({ projects, categories, total, memoryHome, homeSource }: Props) {
  const selectedProject = useUiStore((s) => s.selectedProject);
  const selectedCategory = useUiStore((s) => s.selectedCategory);
  const status = useUiStore((s) => s.status);
  const setSelectedProject = useUiStore((s) => s.setSelectedProject);
  const setSelectedCategory = useUiStore((s) => s.setSelectedCategory);
  const setStatus = useUiStore((s) => s.setStatus);

  return (
    <aside className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-4 py-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">EchoVault</p>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            {total} memories · {homeSource}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 gap-0.5 border-b border-[var(--color-border-subtle)] p-2">
        {statusOptions.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => setStatus(opt.value)}
            className={cn(
              'flex-1 rounded-sm px-2 py-1 text-xs transition-colors',
              status === opt.value
                ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)]/50',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <Section label="Projects">
          <SidebarItem
            label="All projects"
            count={total}
            selected={selectedProject === null}
            onClick={() => setSelectedProject(null)}
          />
          {projects.map((p) => (
            <SidebarItem
              key={p.project}
              label={p.project}
              count={p.count}
              selected={selectedProject === p.project}
              onClick={() => setSelectedProject(p.project)}
            />
          ))}
        </Section>

        <Section label="Categories" className="mt-4">
          <SidebarItem
            label="All categories"
            selected={selectedCategory === null}
            onClick={() => setSelectedCategory(null)}
          />
          {categories
            .filter((c): c is { category: string; count: number } => c.category !== null)
            .map((c) => (
              <SidebarItem
                key={c.category}
                label={c.category}
                count={c.count}
                selected={selectedCategory === c.category}
                onClick={() => setSelectedCategory(c.category)}
              />
            ))}
        </Section>
      </div>

      <div
        className="shrink-0 border-t border-[var(--color-border-subtle)] px-4 py-2 text-[10px] text-[var(--color-text-muted)]"
        title={memoryHome}
      >
        {memoryHome}
      </div>
    </aside>
  );
}

function Section({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarItem({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-sm transition-colors',
        selected
          ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/60',
      )}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">{count}</span>
      )}
    </button>
  );
}
