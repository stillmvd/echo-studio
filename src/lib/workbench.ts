import type { ClaudeSession, ProjectTree, SessionStatus, WorkbenchProject } from './types';

export const STATUS_LABEL: Record<SessionStatus, string> = {
  waiting: 'ждёт тебя',
  error: 'ошибка',
  working: 'работает',
  done: 'готово',
  idle: 'простаивает',
  exited: 'завершена',
};

export function all(tree: ProjectTree): WorkbenchProject[] {
  return [...tree.roots, ...tree.groups.flatMap((g) => g.projects)];
}

export function shortPath(path: string): string {
  return path.replace(/^C:\\Users\\[^\\]+\\/i, '~\\');
}

const norm = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

export function samePath(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

export function projectOf(tree: ProjectTree, cwd: string | null): WorkbenchProject | undefined {
  if (!cwd) return undefined;
  const c = norm(cwd);
  return all(tree)
    .filter((p) => {
      const d = norm(p.path);
      return c === d || c.startsWith(`${d}\\`);
    })
    .sort((a, b) => b.path.length - a.path.length)[0];
}

export function withProjects(
  list: Omit<ClaudeSession, 'projectPath'>[],
  tree: ProjectTree | undefined,
): ClaudeSession[] {
  return list.map((s) => ({
    ...s,
    projectPath: tree ? (projectOf(tree, s.cwd)?.path ?? null) : null,
  }));
}

export interface KeyInput {
  type: string;
  key: string;
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export type KeyAction =
  | { send: string }
  | { copy: true }
  | { native: true }
  | { pass: true }
  | null;

export function terminalKey(e: KeyInput, hasSelection: boolean): KeyAction {
  if (e.type !== 'keydown' || e.metaKey) return null;
  if (e.ctrlKey && e.code === 'Tab') return { pass: true };
  if (e.key === 'Enter' && !e.ctrlKey && (e.shiftKey || e.altKey)) return { send: '\x1b\r' };
  if (e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyV') return { send: '\x1bv' };
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyC' && hasSelection) {
    return { copy: true };
  }
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyV') return { native: true };
  return null;
}

export const URGENCY: SessionStatus[] = ['waiting', 'error', 'working', 'done', 'idle', 'exited'];

export function urgency(status: SessionStatus): number {
  return URGENCY.indexOf(status);
}

export function effectiveStatus(
  session: Pick<ClaudeSession, 'sessionId' | 'status' | 'since'>,
  seen: Record<string, number>,
): SessionStatus {
  const at = seen[session.sessionId];
  if (session.status === 'done' && at !== undefined && at >= (session.since ?? 0)) return 'idle';
  return session.status;
}

function sinceKey(since: number | null): number {
  return since ?? Number.POSITIVE_INFINITY;
}

export function byUrgency<S extends ClaudeSession>(
  sessions: S[],
  seen: Record<string, number>,
): S[] {
  return [...sessions].sort(
    (a, b) =>
      urgency(effectiveStatus(a, seen)) - urgency(effectiveStatus(b, seen)) ||
      sinceKey(a.since) - sinceKey(b.since),
  );
}

export function topStatus(
  sessions: ClaudeSession[],
  seen: Record<string, number>,
): SessionStatus | null {
  const first = byUrgency(sessions, seen)[0];
  return first ? effectiveStatus(first, seen) : null;
}

export const HANDS_ON_MS = 3_000;

export interface WallCell {
  id: string;
  projectPath: string | null;
  pinned: boolean;
  manual: boolean;
  lastInputAt: number;
}

export interface Arrangement<C extends WallCell> {
  cells: C[];
  offGrid: string[];
  pendingCount: number;
}

interface Rank {
  path: string;
  rank: number;
  since: number;
  waiting: boolean;
}

const WORST: Rank = {
  path: '',
  rank: Number.POSITIVE_INFINITY,
  since: Number.POSITIVE_INFINITY,
  waiting: false,
};

function better(a: Rank, b: Rank | undefined): boolean {
  if (!b) return true;
  return a.rank < b.rank || (a.rank === b.rank && a.since < b.since);
}

export function arrangeCells<C extends WallCell>(
  cells: C[],
  sessions: ClaudeSession[],
  now: number,
  focus: string | null,
  seen: Record<string, number> = {},
): Arrangement<C> {
  const ranks = new Map<string, Rank>();
  for (const s of byUrgency(sessions, seen)) {
    const status = effectiveStatus(s, seen);
    if (!s.projectPath || status === 'exited' || ranks.has(s.projectPath)) continue;
    ranks.set(s.projectPath, {
      path: s.projectPath,
      rank: urgency(status),
      since: sinceKey(s.since),
      waiting: status === 'waiting',
    });
  }
  const order = [...ranks.values()].sort((a, b) => a.rank - b.rank || a.since - b.since);
  const out = cells.map((c) => ({ ...c }));
  const locked = (c: C) =>
    c.pinned || c.manual || c.id === focus || now - c.lastInputAt < HANDS_ON_MS;
  const rankOf = (c: C) => (c.projectPath ? ranks.get(c.projectPath) : undefined);
  const shown = new Set(out.map((c) => c.projectPath).filter((p): p is string => !!p));
  for (const candidate of order) {
    if (shown.has(candidate.path)) continue;
    let target: C | undefined;
    for (const c of out) {
      if (locked(c) || !better(candidate, rankOf(c))) continue;
      if (!target || better(rankOf(target) ?? WORST, rankOf(c) ?? WORST)) target = c;
    }
    if (!target) continue;
    if (target.projectPath) shown.delete(target.projectPath);
    target.projectPath = candidate.path;
    shown.add(candidate.path);
  }
  const offGrid = order.filter((r) => !shown.has(r.path));
  return {
    cells: out,
    offGrid: offGrid.map((r) => r.path),
    pendingCount: offGrid.filter((r) => r.waiting).length,
  };
}
