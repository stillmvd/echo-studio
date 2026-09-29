import type { MemoryKind, MemoryRecord } from './types';

export const MEMORY_KINDS: MemoryKind[] = ['decision', 'gotcha', 'bugfix', 'feature', 'discovery'];
export const INDEX_LIMIT = 200;
export const PINNED_LIMIT = 6500;

export type KindFilter = 'all' | MemoryKind | 'other';
export type StatusFilter = 'all' | 'fact' | 'observation' | 'stale';

export interface RecordFilter {
  kind: KindFilter;
  status: StatusFilter;
  query: string;
}

export function matchesRecord(r: MemoryRecord, f: RecordFilter): boolean {
  if (f.kind !== 'all' && kindKey(r.kind) !== f.kind) return false;
  if (f.status === 'stale' && !r.stale) return false;
  if ((f.status === 'fact' || f.status === 'observation') && r.status !== f.status) return false;
  const q = f.query.trim().toLowerCase();
  if (q && !`${r.name}\n${r.description}\n${r.tags.join(' ')}`.toLowerCase().includes(q)) {
    return false;
  }
  return true;
}

export function sortRecords(records: MemoryRecord[]): MemoryRecord[] {
  const rank = (r: MemoryRecord) =>
    (r.importance === 3 ? 0 : 2) + (r.status === 'fact' ? 0 : 1) + (r.stale ? 4 : 0);
  return [...records].sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated));
}

export function indexTooLong(lines: number): boolean {
  return lines > INDEX_LIMIT;
}

export function pinnedChars(records: MemoryRecord[]): number {
  return records.reduce((sum, r) => (r.importance === 3 ? sum + r.bodyChars : sum), 0);
}

export function splitFrontmatter(text: string): { front: string; body: string } {
  const m = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { front: '', body: text };
  return { front: m[1] ?? '', body: text.slice(m[0].length) };
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function formatMemoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

export function formatMemoryDay(day: string): string {
  return formatMemoryDate(/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00` : day);
}

export function formatMemoryTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function baseName(path: string): string {
  return path.split(/[/]/).pop() ?? path;
}

export function kindKey(kind: string | null): MemoryKind | 'other' {
  return MEMORY_KINDS.includes(kind as MemoryKind) ? (kind as MemoryKind) : 'other';
}

export const DUPE_THRESHOLD = 0.72;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function pickCanonical(a: MemoryRecord, b: MemoryRecord): [MemoryRecord, MemoryRecord] {
  const aFirst =
    a.importance !== b.importance
      ? a.importance > b.importance
      : a.seen !== b.seen
        ? a.seen > b.seen
        : a.updated >= b.updated;
  return aFirst ? [a, b] : [b, a];
}

export function mergedFields(canonical: MemoryRecord, absorbed: MemoryRecord) {
  const union = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  return {
    seen: canonical.seen + absorbed.seen,
    importance: Math.max(canonical.importance, absorbed.importance),
    tags: union(canonical.tags, absorbed.tags),
    files: union(canonical.files, absorbed.files),
  };
}

export function similarityShare(score: number): number {
  return Math.min(1, Math.max(0, (score - 0.6) / 0.4));
}
