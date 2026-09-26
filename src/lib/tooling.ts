import type { ToggleTarget, ToolItem, ToolKind } from './types';

export type KindFilter = ToolKind | 'all';

export interface ToolFilter {
  kind: KindFilter;
  query: string;
  projectOnly?: boolean;
}

export interface Segment {
  text: string;
  hit: boolean;
}

function matches(item: ToolItem, q: string): boolean {
  return (
    item.qualifiedName.toLowerCase().includes(q) ||
    (item.description?.toLowerCase().includes(q) ?? false)
  );
}

export function filterTools(items: ToolItem[], f: ToolFilter): ToolItem[] {
  const q = f.query.trim().toLowerCase();
  return items.filter(
    (i) =>
      (f.kind === 'all' || i.kind === f.kind) &&
      (!f.projectOnly || i.origin === 'project' || i.origin === 'local') &&
      (q === '' || matches(i, q)),
  );
}

export function countByKind(items: ToolItem[]): Record<KindFilter, number> {
  const counts: Record<KindFilter, number> = {
    all: items.length,
    skill: 0,
    command: 0,
    agent: 0,
    plugin: 0,
    mcp: 0,
  };
  for (const i of items) counts[i.kind] += 1;
  return counts;
}

export function highlightSegments(text: string, query: string): Segment[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const out: Segment[] = [];
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) out.push({ text: text.slice(from, at), hit: false });
    out.push({ text: text.slice(at, at + q.length), hit: true });
    from = at + q.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false });
  return out;
}

function sameTarget(a: ToggleTarget | null, b: ToggleTarget): boolean {
  return (
    a !== null &&
    a.file === b.file &&
    a.key === b.key &&
    a.name === b.name &&
    a.projectPath === b.projectPath
  );
}

export function applyToggle(items: ToolItem[], target: ToggleTarget, enabled: boolean): ToolItem[] {
  const pluginKey = target.key === 'enabledPlugins' ? target.name : null;
  return items.map((i) => {
    if (sameTarget(i.toggle, target) && (i.state === 'enabled' || i.state === 'disabled')) {
      return { ...i, state: enabled ? 'enabled' : 'disabled' };
    }
    if (pluginKey && i.kind !== 'plugin' && i.pluginKey === pluginKey) {
      if (!enabled && i.state === 'enabled') return { ...i, state: 'unavailable' };
      if (enabled && i.state === 'unavailable') return { ...i, state: 'enabled' };
    }
    return i;
  });
}

export function nestOverrides(items: ToolItem[]): ToolItem[] {
  const key = (i: ToolItem) => `${i.kind}:${i.name.toLowerCase()}`;
  const winners = new Set(items.filter((i) => i.conflict === 'overrides').map(key));
  const out: ToolItem[] = [];
  for (const i of items) {
    if (i.conflict === 'overridden' && winners.has(key(i))) continue;
    out.push(i);
    if (i.conflict === 'overrides') {
      for (const o of items) if (o.conflict === 'overridden' && key(o) === key(i)) out.push(o);
    }
  }
  return out;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

export type ToolRowModel =
  | {
      type: 'group';
      key: string;
      title: string;
      count: number;
      open: boolean;
      origin: 'plugin' | 'prefix';
    }
  | { type: 'item'; item: ToolItem; grouped: boolean };

function prefixOf(name: string): string {
  return name.split('-')[0] ?? name;
}

function groupOf(item: ToolItem, prefixes: Set<string>): string | null {
  if (item.origin === 'plugin' && item.pluginKey) return `plugin:${item.pluginKey}`;
  const prefix = prefixOf(item.name).toLowerCase();
  return prefixes.has(prefix) ? `prefix:${prefix}` : null;
}

export function groupSkills(
  all: ToolItem[],
  shown: ToolItem[],
  openKeys: ReadonlySet<string>,
  searching: boolean,
): ToolRowModel[] {
  const perPrefix = new Map<string, number>();
  for (const i of all) {
    if (i.origin === 'plugin') continue;
    const p = prefixOf(i.name).toLowerCase();
    perPrefix.set(p, (perPrefix.get(p) ?? 0) + 1);
  }
  const prefixes = new Set([...perPrefix].filter(([, n]) => n >= 3).map(([p]) => p));

  const groups = new Map<string, ToolItem[]>();
  const top: { sort: string; rows: ToolRowModel[] }[] = [];
  for (const item of shown) {
    const key = groupOf(item, prefixes);
    if (!key) {
      top.push({ sort: item.name.toLowerCase(), rows: [{ type: 'item', item, grouped: false }] });
      continue;
    }
    const members = groups.get(key);
    if (members) members.push(item);
    else groups.set(key, [item]);
  }
  for (const [key, members] of groups) {
    const plugin = key.startsWith('plugin:');
    const title = plugin ? (key.slice(7).split('@')[0] ?? key) : key.slice(7);
    const open = searching || openKeys.has(key);
    const rows: ToolRowModel[] = [
      {
        type: 'group',
        key,
        title,
        count: members.length,
        open,
        origin: plugin ? 'plugin' : 'prefix',
      },
    ];
    if (open) for (const item of members) rows.push({ type: 'item', item, grouped: true });
    top.push({ sort: title.toLowerCase(), rows });
  }
  return top.sort((a, b) => a.sort.localeCompare(b.sort)).flatMap((t) => t.rows);
}
