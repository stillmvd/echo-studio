import type { ToolItem, ToolKind } from './types';

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
