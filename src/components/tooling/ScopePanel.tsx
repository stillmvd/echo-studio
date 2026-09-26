import {
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  Globe,
  SquareTerminal,
} from 'lucide-react';
import { useState } from 'react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { cn } from '@/lib/cn';
import { menuPoint } from '@/lib/context-menu';
import { openInClaudeCode, revealInExplorer } from '@/lib/ipc';
import type { ScopeRef } from '@/lib/types';

interface Props {
  scopes: ScopeRef[];
  selectedPath: string | null;
  globalCount: number | undefined;
  onSelect: (path: string | null) => void;
}

function ScopeRow({
  icon: Icon,
  name,
  title,
  selected,
  missing,
  count,
  onClick,
  onContextMenu,
}: {
  icon: typeof Globe;
  name: string;
  title?: string;
  selected: boolean;
  missing?: boolean;
  count?: number;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <li className="shrink-0">
      <button
        type="button"
        title={title}
        aria-current={selected ? 'true' : undefined}
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={cn(
          'flex h-11 w-full items-center gap-2.5 rounded-full pr-1.5 pl-3.5 text-left text-sm transition-colors duration-200 ease-[var(--ease-trail)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
          selected
            ? 'bg-[var(--color-text-primary)] font-bold text-[var(--color-bg-primary)]'
            : 'font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]',
        )}
      >
        <Icon
          className={cn(
            'h-4 w-4 shrink-0',
            selected ? 'text-[var(--color-bg-primary)]' : 'text-[var(--color-text-muted)]',
          )}
          strokeWidth={1.75}
        />
        <span className={cn('min-w-0 flex-1 truncate', missing && !selected && 'opacity-60')}>
          {name}
        </span>
        {count !== undefined && (
          <span
            className={cn(
              'inline-flex h-6 shrink-0 items-center rounded-full px-[9px] text-[11px] font-medium tabular-nums',
              selected
                ? 'bg-[color-mix(in_srgb,var(--color-bg-primary)_16%,transparent)] text-[color-mix(in_srgb,var(--color-bg-primary)_62%,transparent)]'
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
            )}
          >
            {count}
          </span>
        )}
      </button>
    </li>
  );
}

export function ScopePanel({ scopes, selectedPath, globalCount, onSelect }: Props) {
  const projects = scopes.filter((s) => s.kind === 'project');
  const live = projects.filter((s) => s.available);
  const missing = projects.filter((s) => !s.available);
  const missingSelected = missing.some((s) => s.path === selectedPath);
  const [missingOpen, setMissingOpen] = useState(false);
  const showMissing = missingOpen || missingSelected;
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const projectRow = (s: ScopeRef) => (
    <ScopeRow
      key={s.path}
      icon={Folder}
      name={s.name}
      title={s.path ?? undefined}
      selected={selectedPath === s.path}
      missing={!s.available}
      onClick={() => onSelect(s.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (s.path && s.available) setMenu({ ...menuPoint(e), path: s.path });
      }}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 pt-5 pb-3">
      <h2 className="px-2 text-[22px] leading-[1.06] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
        All <b className="font-bold">scopes</b>
      </h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <ScopeRow
          icon={Globe}
          name="Global"
          title="~/.claude, ~/.claude.json and installed plugins"
          selected={selectedPath === null}
          count={globalCount}
          onClick={() => onSelect(null)}
        />
        <li className="shrink-0 px-3.5 pt-2.5 pb-1 text-xs font-medium text-[var(--color-text-muted)]">
          Projects · {live.length}
        </li>
        {live.map(projectRow)}
        {missing.length > 0 && (
          <li className="shrink-0 pt-1.5">
            <button
              type="button"
              aria-expanded={showMissing}
              disabled={missingSelected}
              onClick={() => setMissingOpen((o) => !o)}
              className="flex w-full items-center gap-1.5 rounded-full px-3.5 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)] outline-none hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:hover:text-[var(--color-text-muted)]"
            >
              {showMissing ? (
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              Missing · {missing.length}
            </button>
          </li>
        )}
        {showMissing && missing.map(projectRow)}
      </ul>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Show in Explorer',
              icon: <FolderOpen className="h-3.5 w-3.5" />,
              onSelect: () => {
                revealInExplorer(menu.path).catch(() => {});
              },
            },
            {
              label: 'Open in Claude Code',
              icon: <SquareTerminal className="h-3.5 w-3.5" />,
              onSelect: () => {
                openInClaudeCode(menu.path).catch(() => {});
              },
            },
            'separator',
            {
              label: 'Copy path',
              icon: <Copy className="h-3.5 w-3.5" />,
              onSelect: () => {
                navigator.clipboard.writeText(menu.path).catch(() => {});
              },
            },
          ]}
        />
      )}
    </div>
  );
}
