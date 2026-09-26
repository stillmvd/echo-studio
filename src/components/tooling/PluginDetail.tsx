import type { ToolItem } from '@/lib/types';
import { KIND_META } from './kinds';
import { describeTool } from './ToolRow';

const SHOWN = 6;

function date(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
      <dt className="text-[13px] font-medium text-[var(--color-text-muted)]">{label}</dt>
      <dd className="m-0 min-w-0 text-sm font-medium">{children}</dd>
    </div>
  );
}

export function PluginDetail({ item, members }: { item: ToolItem; members: ToolItem[] }) {
  const p = item.plugin;
  if (!p) return null;
  const tiles: [string, number][] = [
    ['Skills', p.contents.skills],
    ['Commands', p.contents.commands],
    ['Agents', p.contents.agents],
    ['MCP', p.contents.mcp],
    ['Hooks', p.contents.hooks],
  ];
  const groups = (['skill', 'command', 'agent', 'mcp'] as const)
    .map((k) => ({ kind: k, list: members.filter((c) => c.kind === k) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-5 gap-2 @max-[420px]:grid-cols-3">
        {tiles.map(([label, n]) => (
          <span
            key={label}
            className="flex min-w-0 flex-col gap-0.5 rounded-[20px] bg-[var(--color-bg-tertiary)] px-3 py-2.5"
          >
            <b className="text-xl leading-[1.1] font-light tracking-[-0.02em] tabular-nums">{n}</b>
            <span className="truncate text-[11px] font-medium text-[var(--color-text-muted)]">
              {label}
            </span>
          </span>
        ))}
      </div>
      <dl className="m-0 flex flex-col gap-2.5">
        <Row label="Version">
          <span className="font-mono text-xs font-normal">{p.version ?? '—'}</span>
        </Row>
        <Row label="Marketplace">{p.marketplace || '—'}</Row>
        <Row label="Installed">
          {date(p.installedAt)} · updated {date(p.lastUpdated)}
        </Row>
        <Row label="Folder">
          <span className="font-mono text-xs font-normal [overflow-wrap:anywhere]">
            {p.installPath}
          </span>
        </Row>
      </dl>
      {groups.map(({ kind, list }) => {
        const Icon = KIND_META[kind].icon;
        return (
          <div key={kind} className="flex flex-col gap-0.5">
            <div className="px-3 pt-2 pb-1 text-xs font-medium text-[var(--color-text-muted)]">
              <b className="font-bold text-[var(--color-text-primary)]">{KIND_META[kind].label}</b>{' '}
              {list.length} · off with the plugin
            </div>
            {list.slice(0, SHOWN).map((c) => (
              <div
                key={c.id}
                className="flex h-9 items-center gap-2.5 rounded-full px-3 text-[13px] font-medium text-[var(--color-text-muted)]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                <span className="shrink-0 text-[var(--color-text-primary)]">{c.name}</span>
                <span className="min-w-0 flex-1 truncate text-xs">{describeTool(c)}</span>
              </div>
            ))}
            {list.length > SHOWN && (
              <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)]">
                and {list.length - SHOWN} more
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
