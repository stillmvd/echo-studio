import type {
  ClaudeSession,
  DevServer,
  DevState,
  ProjectTree,
  SessionStatus,
  WorkbenchProject,
} from './types';

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

function cmp(a: number | string, b: number | string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function byUrgency<S extends ClaudeSession>(
  sessions: S[],
  seen: Record<string, number>,
): S[] {
  return [...sessions].sort(
    (a, b) =>
      cmp(urgency(effectiveStatus(a, seen)), urgency(effectiveStatus(b, seen))) ||
      cmp(sinceKey(a.since), sinceKey(b.since)) ||
      cmp(a.sessionId, b.sessionId),
  );
}

const DEV_STATUS: Record<DevState, SessionStatus> = {
  error: 'error',
  starting: 'working',
  running: 'idle',
  stopped: 'exited',
};

export type RunningItem =
  | { kind: 'session'; session: ClaudeSession }
  | { kind: 'dev'; server: DevServer };

export function runningItems(
  sessions: ClaudeSession[],
  servers: DevServer[],
  seen: Record<string, number>,
): RunningItem[] {
  const rank = (item: RunningItem) =>
    urgency(
      item.kind === 'session' ? effectiveStatus(item.session, seen) : DEV_STATUS[item.server.state],
    );
  return [
    ...byUrgency(sessions, seen).map((session) => ({ kind: 'session' as const, session })),
    ...servers
      .filter((server) => server.state !== 'stopped')
      .map((server) => ({ kind: 'dev' as const, server })),
  ].sort((a, b) => rank(a) - rank(b));
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
  activeTab?: string;
}

export interface Arrangement<C extends WallCell> {
  cells: C[];
  moved: string[];
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

function compareRank(a: Rank, b: Rank): number {
  return cmp(a.rank, b.rank) || cmp(a.since, b.since) || cmp(a.path, b.path);
}

function better(a: Rank, b: Rank | undefined): boolean {
  if (!b) return true;
  return cmp(a.rank, b.rank) < 0 || (a.rank === b.rank && cmp(a.since, b.since) < 0);
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
  const order = [...ranks.values()].sort(compareRank);
  const out = cells.map((c) => ({ ...c }));
  const locked = (c: C) =>
    c.pinned || c.manual || c.id === focus || now - c.lastInputAt < HANDS_ON_MS;
  const rankOf = (c: C) => (c.projectPath ? ranks.get(c.projectPath) : undefined);
  const shown = new Map<string, number>();
  const show = (path: string | null, delta: number) => {
    if (path) shown.set(path, (shown.get(path) ?? 0) + delta);
  };
  for (const c of out) show(c.projectPath, 1);
  for (const candidate of order) {
    if ((shown.get(candidate.path) ?? 0) > 0) continue;
    let target: C | undefined;
    for (const c of out) {
      if (locked(c) || !better(candidate, rankOf(c))) continue;
      if (!target || better(rankOf(target) ?? WORST, rankOf(c) ?? WORST)) target = c;
    }
    if (!target) continue;
    show(target.projectPath, -1);
    target.projectPath = candidate.path;
    show(candidate.path, 1);
  }
  const offGrid = order.filter((r) => (shown.get(r.path) ?? 0) === 0);
  return {
    cells: out,
    moved: out.filter((c, i) => c.projectPath !== cells[i]?.projectPath).map((c) => c.id),
    offGrid: offGrid.map((r) => r.path),
    pendingCount: offGrid.filter((r) => r.waiting).length,
  };
}

export type WallLayout = '1x1' | '2x1' | '2x2';

export const CELL_COUNT: Record<WallLayout, number> = { '1x1': 1, '2x1': 2, '2x2': 4 };

export function emptyCells(): WallCell[] {
  return ['c1', 'c2', 'c3', 'c4'].map((id) => ({
    id,
    projectPath: null,
    pinned: false,
    manual: false,
    lastInputAt: 0,
  }));
}

export function placeProject(
  cells: WallCell[],
  layout: WallLayout,
  focus: string | null,
  path: string,
): { cells: WallCell[]; focus: string } {
  const count = CELL_COUNT[layout];
  const shown = cells.slice(0, count);
  const holds = (c: WallCell) => c.projectPath !== null && samePath(c.projectPath, path);
  const already = shown.find(holds);
  if (already) return { cells, focus: already.id };
  const target =
    shown.find((c) => c.id === focus && !c.pinned) ??
    shown.find((c) => c.projectPath === null) ??
    shown.find((c) => !c.pinned && !c.manual) ??
    shown.find((c) => !c.pinned) ??
    shown[0];
  if (!target) return { cells, focus: focus ?? '' };
  const hidden = cells.slice(count).find(holds);
  return {
    cells: cells.map((c) => {
      if (c.id === target.id) {
        return { ...c, projectPath: path, manual: true, activeTab: hidden?.activeTab };
      }
      if (c.id === hidden?.id) return { ...c, ...freeCell() };
      return c;
    }),
    focus: target.id,
  };
}

function freeCell(): Omit<WallCell, 'id'> {
  return { projectPath: null, pinned: false, manual: false, lastInputAt: 0, activeTab: undefined };
}

export function normalizeCells(cells: unknown): WallCell[] {
  const list = Array.isArray(cells) ? cells : [];
  return emptyCells().map((empty, i) => {
    const c = list[i] as Partial<WallCell> | undefined;
    if (!c || typeof c !== 'object') return empty;
    return {
      id: empty.id,
      projectPath: typeof c.projectPath === 'string' ? c.projectPath : null,
      pinned: c.pinned === true,
      manual: c.manual === true,
      lastInputAt: 0,
      activeTab: typeof c.activeTab === 'string' ? c.activeTab : undefined,
    };
  });
}

export function pruneCells(cells: WallCell[], exists: (path: string) => boolean): WallCell[] {
  if (cells.every((c) => c.projectPath === null || exists(c.projectPath))) return cells;
  return cells.map((c) =>
    c.projectPath === null || exists(c.projectPath) ? c : { ...c, ...freeCell() },
  );
}

export function assignTabs(
  cells: WallCell[],
  tabsOf: (path: string) => string[],
  activeOf: (path: string) => string | undefined,
): (string | null)[] {
  const used = new Set<string>();
  return cells.map((c) => {
    if (!c.projectPath) return null;
    const list = tabsOf(c.projectPath);
    const free = (k: string | undefined): k is string => !!k && list.includes(k) && !used.has(k);
    const key = [c.activeTab, activeOf(c.projectPath), ...list].find(free) ?? null;
    if (key) used.add(key);
    return key;
  });
}

export function byRecency<S extends ClaudeSession>(
  sessions: S[],
  recency: string[],
  seen: Record<string, number>,
): S[] {
  const at = (s: S) => {
    const i = recency.indexOf(s.sessionId);
    return i < 0 ? recency.length : i;
  };
  const urgent = byUrgency(sessions, seen);
  return [...urgent].sort((a, b) => at(a) - at(b) || urgent.indexOf(a) - urgent.indexOf(b));
}

export function nextInRecency(
  order: string[],
  current: string | null,
  back = false,
): string | null {
  if (order.length === 0) return null;
  const i = current === null ? 0 : order.indexOf(current);
  const step = back ? -1 : 1;
  return order[(Math.max(i, 0) + step + order.length) % order.length] ?? null;
}
