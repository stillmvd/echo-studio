import { plural } from './memory';
import type {
  ClaudeSession,
  DevServer,
  DevState,
  ProjectTree,
  SessionStatus,
  WorkbenchProject,
} from './types';

export type StatusView = SessionStatus | 'new';

export type DevHealth = DevState | 'crashed' | 'errors';

export function devHealth(server: DevServer | undefined): DevHealth {
  if (!server) return 'stopped';
  if (server.state === 'error') return 'crashed';
  if (server.errors && server.state !== 'stopped') return 'errors';
  return server.state;
}

export function errorsLabel(count: number): string {
  return `${count} ${plural(count, 'ошибка', 'ошибки', 'ошибок')}`;
}

export function crashLabel(server: Pick<DevServer, 'exitCode' | 'restarted'>): string {
  return `${server.restarted ? 'упал снова' : 'упал'} · код ${server.exitCode ?? '?'}`;
}

export function devStatusLabel(server: DevServer): string {
  const health = devHealth(server);
  if (health === 'crashed') return crashLabel(server);
  if (health === 'errors') return errorsLabel(server.errors?.count ?? 1);
  if (health === 'starting') return 'запускается';
  if (health === 'running') return server.ports.map((p) => `:${p}`).join(' ') || 'без порта';
  return 'остановлен';
}

export const STATUS_LABEL: Record<StatusView, string> = {
  waiting: 'ждёт тебя',
  error: 'ошибка',
  working: 'работает',
  done: 'ответ готов',
  idle: 'ждёт задачу',
  new: 'новая · ждёт задачу',
  exited: 'завершена',
};

export const STATUS_HINT: Record<StatusView, string> = {
  waiting: 'Claude задал вопрос или ждёт подтверждения',
  error: 'Ответ Claude оборвался с ошибкой',
  working: 'Claude отвечает',
  done: 'Claude закончил, ответ ещё не открывали',
  idle: 'Можно писать следующую задачу',
  new: 'Сессия запущена, первого запроса ещё не было',
  exited: 'Сессия завершена',
};

export const EXTERNAL_LABEL = 'вне Echo';
export const EXTERNAL_HINT = 'Открыта в терминале вне Echo';

export function statusTitle(status: StatusView, external = false): string {
  const line = `${STATUS_LABEL[status]} — ${STATUS_HINT[status]}`;
  return external ? `${line}\n${EXTERNAL_HINT}` : line;
}

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

export function isPathTitle(title: string): boolean {
  return (
    /^[A-Za-z]:[\\/]/.test(title) ||
    /^(\\\\|\/)[^\s\\/]*[\\/]\S*$/.test(title) ||
    /^\S+\.exe$/i.test(title)
  );
}

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

export function urgency(status: StatusView): number {
  return URGENCY.indexOf(status === 'new' ? 'idle' : status);
}

export function effectiveStatus(
  session: Pick<ClaudeSession, 'sessionId' | 'status' | 'since'>,
  seen: Record<string, number>,
): SessionStatus {
  const at = seen[session.sessionId];
  if (session.status === 'done' && at !== undefined && at >= (session.since ?? 0)) return 'idle';
  return session.status;
}

export function statusView(
  session: Pick<ClaudeSession, 'sessionId' | 'status' | 'since' | 'name'>,
  seen: Record<string, number>,
): StatusView {
  return session.status === 'idle' && !hasTitle(session) ? 'new' : effectiveStatus(session, seen);
}

export function hasTitle(session: Pick<ClaudeSession, 'sessionId' | 'name'>): boolean {
  const name = session.name?.trim().toLowerCase();
  return !!name && name !== session.sessionId.slice(0, 8).toLowerCase();
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

export interface RunningGroup {
  path: string | null;
  sessions: ClaudeSession[];
  devs: DevServer[];
  top: RunningItem;
}

export function runningGroups(
  sessions: ClaudeSession[],
  servers: DevServer[],
  seen: Record<string, number>,
): RunningGroup[] {
  const rank = (item: RunningItem) =>
    urgency(
      item.kind === 'session'
        ? effectiveStatus(item.session, seen)
        : devHealth(item.server) === 'errors'
          ? 'error'
          : DEV_STATUS[item.server.state],
    );
  const groups = new Map<string, Omit<RunningGroup, 'top'>>();
  const group = (path: string | null) => {
    const key = path ? norm(path) : '';
    const found = groups.get(key);
    if (found) return found;
    const created = { path, sessions: [], devs: [] };
    groups.set(key, created);
    return created;
  };
  for (const s of byUrgency(sessions, seen)) group(s.projectPath).sessions.push(s);
  for (const d of servers) if (d.state !== 'stopped') group(d.projectPath).devs.push(d);
  return [...groups.values()]
    .map((g) => {
      const items: RunningItem[] = [
        ...g.sessions.map((session) => ({ kind: 'session' as const, session })),
        ...g.devs.map((server) => ({ kind: 'dev' as const, server })),
      ];
      const top = items.reduce((a, b) => (rank(b) < rank(a) ? b : a));
      return { ...g, top };
    })
    .sort((a, b) => rank(a.top) - rank(b.top) || Number(!a.path) - Number(!b.path));
}

export function recentSessions(
  history: string[],
  sessions: ClaudeSession[],
  limit = 6,
): ClaudeSession[] {
  const live = new Map(
    sessions.filter((s) => s.status !== 'exited').map((s) => [s.sessionId, s] as const),
  );
  return history.flatMap((id) => live.get(id) ?? []).slice(0, limit);
}

const AGENT_VIEW_MARKERS = [
  /^\s*\S*\s*New sessions: \S/m,
  /^\s*\S*\s*describe a task for a\b/im,
  /^\s*enter to return ·/m,
  /^\s*Accessing workspace:\s*$/m,
  /^\s*Quick safety check:/m,
];

export function detectAgentView(lines: string[]): boolean {
  const screen = lines.join('\n');
  return AGENT_VIEW_MARKERS.filter((m) => m.test(screen)).length >= 2;
}

export function externalAction(s: ClaudeSession): 'focus' | 'resume' | 'none' {
  if (s.kind !== 'external') return 'none';
  if (s.status !== 'exited') return 'focus';
  return s.projectPath ? 'resume' : 'none';
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

export interface WallTabs {
  tabsOf: (path: string) => string[];
  activeOf: (path: string) => string | undefined;
  pick?: TabPick;
  isFresh?: (key: string) => boolean;
  ready?: boolean;
}

function shownKeys(visible: WallCell[], tabs: WallTabs): (string | null)[] {
  const extra = (path: string) =>
    visible.flatMap((c) =>
      c.activeTab && c.projectPath && samePath(c.projectPath, path) ? [c.activeTab] : [],
    );
  return assignTabs(
    visible,
    (path) => [...tabs.tabsOf(path), ...extra(path)],
    tabs.activeOf,
    tabs.pick,
  );
}

export function displayedSessions(
  visible: WallCell[],
  sessions: ClaudeSession[],
  tabs: WallTabs,
): Set<string> {
  const keys = new Set(shownKeys(visible, tabs).filter((k): k is string => !!k));
  const inGrid = (path: string) =>
    visible.some((c) => c.projectPath !== null && samePath(c.projectPath, path));
  return new Set(
    sessions
      .filter((s) =>
        s.kind === 'shell' ? keys.has(s.sessionId) : !!s.projectPath && inGrid(s.projectPath),
      )
      .map((s) => s.sessionId),
  );
}

export interface WallArrangement {
  cells: WallCell[];
  moved: string[];
  changed: boolean;
  offGrid: string[];
  pendingCount: number;
}

export function arrangeWall(
  cells: WallCell[],
  count: number,
  sessions: ClaudeSession[],
  now: number,
  focus: string | null,
  seen: Record<string, number>,
  wallTabs: WallTabs,
): WallArrangement {
  if (wallTabs.ready === false) {
    return { cells, moved: [], changed: false, offGrid: [], pendingCount: 0 };
  }
  const tabs = { ...wallTabs, pick: wallTabs.pick ?? wallPick(sessions, seen, wallTabs.activeOf) };
  const hot = sessions.filter(
    (s) => s.kind === 'shell' && WALL_STATUSES.includes(effectiveStatus(s, seen)),
  );
  const r = arrangeCells(cells.slice(0, count), hot, now, focus, seen);
  const topHot = (path: string | null) =>
    byUrgency(hot, seen).find((s) => path && s.projectPath && samePath(s.projectPath, path))
      ?.sessionId;
  const visible = r.cells.map((c, i) =>
    c.projectPath === cells[i]?.projectPath ? c : { ...c, activeTab: topHot(c.projectPath) },
  );
  const holds = (c: WallCell, path: string | null) =>
    path !== null && c.projectPath !== null && samePath(c.projectPath, path);
  const locked = (c: WallCell) =>
    c.pinned || c.manual || c.id === focus || now - c.lastInputAt < HANDS_ON_MS;
  const keys = shownKeys(visible, tabs);
  for (const [i, c] of visible.entries()) {
    const holder = visible.findIndex(
      (o, j) => j !== i && holds(o, c.projectPath) && (o.pinned || o.manual) && !keys[j],
    );
    const held = visible[holder];
    const key = keys[i];
    if (held && key && !locked(c)) {
      visible[holder] = { ...held, activeTab: key };
      visible[i] = { ...c, ...freeCell() };
      keys[holder] = key;
      keys[i] = null;
      continue;
    }
    const twin = visible.some(
      (o, j) => j !== i && holds(o, c.projectPath) && (j < i || o.pinned || o.manual),
    );
    if (twin && !keys[i] && !locked(c)) visible[i] = { ...c, ...freeCell() };
  }
  const rankOfKey = (key: string | null) => {
    const s = key ? sessions.find((x) => x.sessionId === key) : undefined;
    return s ? urgency(effectiveStatus(s, seen)) : URGENCY.length;
  };
  for (const s of byUrgency(sessions, seen)) {
    const status = effectiveStatus(s, seen);
    if (s.kind !== 'shell' || !s.projectPath || (status !== 'waiting' && status !== 'error')) {
      continue;
    }
    if (displayedSessions(visible, [s], tabs).size > 0) continue;
    const current = shownKeys(visible, tabs);
    const cellRank = (i: number) =>
      visible[i]?.projectPath === null ? Number.POSITIVE_INFINITY : rankOfKey(current[i] ?? null);
    const rank = urgency(status);
    let target = -1;
    for (const [i, c] of visible.entries()) {
      if (locked(c) || cellRank(i) <= rank) continue;
      if (target < 0 || cellRank(i) > cellRank(target)) target = i;
    }
    const cell = visible[target];
    if (!cell) continue;
    visible[target] = {
      ...cell,
      projectPath: s.projectPath,
      activeTab: s.sessionId,
      manual: false,
    };
  }
  const live = (key: string) =>
    key.startsWith('dev:') ||
    !!tabs.isFresh?.(key) ||
    sessions.some((s) => s.sessionId === key && effectiveStatus(s, seen) !== 'exited');
  const final = shownKeys(visible, tabs);
  for (const [i, c] of visible.entries()) {
    if (!c.projectPath || c.pinned || c.manual || now - c.lastInputAt < HANDS_ON_MS) continue;
    const key = final[i];
    if (key ? live(key) : c.id === focus) continue;
    visible[i] = { ...c, ...freeCell() };
  }
  const hidden = cells
    .slice(count)
    .map((c) =>
      !c.pinned && !c.manual && visible.some((v) => holds(v, c.projectPath))
        ? { ...c, ...freeCell() }
        : c,
    );
  const all = [...visible, ...hidden];
  const moved = visible
    .filter(
      (c, i) => c.projectPath !== cells[i]?.projectPath || c.activeTab !== cells[i]?.activeTab,
    )
    .map((c) => c.id);
  const changed = all.some(
    (c, i) => c.projectPath !== cells[i]?.projectPath || c.activeTab !== cells[i]?.activeTab,
  );
  const shown = displayedSessions(visible, sessions, tabs);
  const off = byUrgency(
    sessions.filter(
      (s) => !!s.projectPath && effectiveStatus(s, seen) !== 'exited' && !shown.has(s.sessionId),
    ),
    seen,
  );
  return {
    cells: all,
    moved,
    changed,
    offGrid: off.map((s) => s.sessionId),
    pendingCount: off.filter((s) => s.kind === 'shell' && effectiveStatus(s, seen) === 'waiting')
      .length,
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
  if (already?.pinned || already?.manual) return { cells, focus: already.id };
  if (already) {
    return {
      cells: cells.map((c) => (c.id === already.id ? { ...c, manual: true } : c)),
      focus: already.id,
    };
  }
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
        return { ...c, projectPath: path, manual: true, activeTab: undefined };
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
    const pinned = c.pinned === true;
    return {
      id: empty.id,
      projectPath: typeof c.projectPath === 'string' ? c.projectPath : null,
      pinned,
      manual: false,
      lastInputAt: 0,
      activeTab: pinned && typeof c.activeTab === 'string' ? c.activeTab : undefined,
    };
  });
}

export function pruneCells(cells: WallCell[], exists: (path: string) => boolean): WallCell[] {
  if (cells.every((c) => c.projectPath === null || exists(c.projectPath))) return cells;
  return cells.map((c) =>
    c.projectPath === null || exists(c.projectPath) ? c : { ...c, ...freeCell() },
  );
}

export interface ProjectCell {
  tabs: string[];
  active?: string;
}

export interface ProjectLayout {
  layout: WallLayout;
  cells: ProjectCell[];
  focus: number;
}

const PROJECT_CELLS = 4;

export function emptyLayout(): ProjectLayout {
  return {
    layout: '1x1',
    cells: Array.from({ length: PROJECT_CELLS }, () => ({ tabs: [] })),
    focus: 0,
  };
}

export function isLayout(value: unknown): value is WallLayout {
  return typeof value === 'string' && Object.hasOwn(CELL_COUNT, value);
}

export function normalizeLayout(raw: unknown, tabs: string[]): ProjectLayout {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<ProjectLayout>;
  const layout = isLayout(src.layout) ? src.layout : '1x1';
  const count = CELL_COUNT[layout];
  const focus =
    typeof src.focus === 'number' && Number.isInteger(src.focus)
      ? Math.min(Math.max(src.focus, 0), count - 1)
      : 0;
  const rawCells = Array.isArray(src.cells) ? src.cells : [];
  const open = new Set(tabs);
  const used = new Set<string>();
  const lists: string[][] = Array.from({ length: PROJECT_CELLS }, () => []);
  for (let i = 0; i < PROJECT_CELLS; i++) {
    const list = (rawCells[i] as Partial<ProjectCell> | undefined)?.tabs;
    if (!Array.isArray(list)) continue;
    const target = lists[Math.min(i, count - 1)] as string[];
    for (const key of list) {
      if (typeof key !== 'string' || !open.has(key) || used.has(key)) continue;
      used.add(key);
      target.push(key);
    }
  }
  const fresh = tabs.filter((k) => !used.has(k));
  (lists[focus] as string[]).push(...new Set(fresh));
  return {
    layout,
    focus,
    cells: lists.map((list, i) => {
      const prev = (rawCells[i] as Partial<ProjectCell> | undefined)?.active;
      const active = typeof prev === 'string' && list.includes(prev) ? prev : list[list.length - 1];
      return active ? { tabs: list, active } : { tabs: list };
    }),
  };
}

export function cellOfTab(layout: ProjectLayout, key: string): number {
  return layout.cells.findIndex((c) => c.tabs.includes(key));
}

export function insertTab(list: string[], key: string, index?: number): string[] {
  const at = list.indexOf(key);
  const rest = list.filter((k) => k !== key);
  let pos = index ?? rest.length;
  if (at >= 0 && index !== undefined && at < index) pos -= 1;
  pos = Math.min(Math.max(pos, 0), rest.length);
  return [...rest.slice(0, pos), key, ...rest.slice(pos)];
}

export function showTabInLayout(layout: ProjectLayout, key: string): ProjectLayout {
  const i = cellOfTab(layout, key);
  if (i < 0) return layout;
  if (layout.focus === i && layout.cells[i]?.active === key) return layout;
  return {
    ...layout,
    focus: i,
    cells: layout.cells.map((c, j) => (j === i ? { ...c, active: key } : c)),
  };
}

export function endedTabs(
  tabs: Record<string, string[]>,
  live: Set<string>,
  fresh: (key: string) => boolean,
): { path: string; key: string }[] {
  return Object.entries(tabs).flatMap(([path, keys]) =>
    keys
      .filter((key) => !key.startsWith('dev:') && !live.has(key) && !fresh(key))
      .map((key) => ({ path, key })),
  );
}

export function tabsToClose(
  ended: { path: string; key: string }[],
  auto: string[],
  empty: string[],
): { path: string; key: string }[] {
  return ended.filter((t) => auto.includes(t.key) || empty.includes(t.key));
}

function filledCells(layout: ProjectLayout): ProjectCell[] {
  return layout.cells.slice(0, CELL_COUNT[layout.layout]).filter((c) => c.tabs.length > 0);
}

export function closeTabInLayout(
  layout: ProjectLayout,
  key: string,
  tabs: string[],
): ProjectLayout {
  const from = cellOfTab(layout, key);
  const cell = layout.cells[from];
  const at = cell?.tabs.indexOf(key) ?? -1;
  const next =
    !cell || cell.active !== key
      ? normalizeLayout(layout, tabs)
      : normalizeLayout(
          {
            ...layout,
            cells: layout.cells.map((c, i) =>
              i === from ? { ...c, active: cell.tabs[at + 1] ?? cell.tabs[at - 1] } : c,
            ),
          },
          tabs,
        );
  const left = filledCells(next);
  if (left.length !== 1 || filledCells(layout).length < 2) return next;
  return normalizeLayout({ layout: '1x1', focus: 0, cells: left }, tabs);
}

export function moveTabInLayout(
  layout: ProjectLayout,
  key: string,
  toCell: number,
  index?: number,
): ProjectLayout {
  const from = cellOfTab(layout, key);
  const to = Math.min(Math.max(toCell, 0), CELL_COUNT[layout.layout] - 1);
  if (from < 0) return layout;
  const cells = layout.cells.map((c, i) => {
    if (i !== from || i === to) return c;
    const tabs = c.tabs.filter((k) => k !== key);
    const active = c.active === key ? tabs[tabs.length - 1] : c.active;
    return active ? { tabs, active } : { tabs };
  });
  cells[to] = { tabs: insertTab(cells[to]?.tabs ?? [], key, index), active: key };
  return { ...layout, cells, focus: to };
}

export function urgentTab(
  sessions: ClaudeSession[],
  path: string,
  seen: Record<string, number>,
): string | null {
  const own = sessions.filter(
    (s) => s.kind === 'shell' && s.projectPath !== null && samePath(s.projectPath, path),
  );
  const top = byUrgency(own, seen)[0];
  if (!top) return null;
  const status = effectiveStatus(top, seen);
  return status === 'waiting' || status === 'error' ? top.sessionId : null;
}

export function cellShowing(
  cells: WallCell[],
  layout: WallLayout,
  focus: string | null,
  path: string,
): string | null {
  const holders = cells
    .slice(0, CELL_COUNT[layout])
    .filter((c) => c.projectPath !== null && samePath(c.projectPath, path));
  return (holders.find((c) => c.id === focus) ?? holders[0])?.id ?? null;
}

export type TabPick = (path: string, held: boolean, list: string[]) => (string | undefined)[];

const WALL_STATUSES: SessionStatus[] = ['waiting', 'working', 'error'];

export function wallPick(
  sessions: ClaudeSession[],
  seen: Record<string, number>,
  activeOf: (path: string) => string | undefined,
): TabPick {
  const ordered = byUrgency(
    sessions.filter((s) => s.kind === 'shell' && effectiveStatus(s, seen) !== 'exited'),
    seen,
  );
  return (path, held, list) => {
    const own = ordered.filter(
      (s) => s.projectPath && samePath(s.projectPath, path) && list.includes(s.sessionId),
    );
    const hot = own.filter((s) => WALL_STATUSES.includes(effectiveStatus(s, seen)));
    const active = activeOf(path);
    const first = held && own.some((s) => s.sessionId === active) ? [active] : [];
    return [...first, ...hot.map((s) => s.sessionId), ...own.map((s) => s.sessionId)];
  };
}

export function assignTabs(
  cells: WallCell[],
  tabsOf: (path: string) => string[],
  activeOf: (path: string) => string | undefined,
  pick?: TabPick,
): (string | null)[] {
  const used = new Set<string>();
  const own = cells.map((c) => {
    const key = c.projectPath && c.activeTab;
    if (!key || used.has(key) || !tabsOf(c.projectPath ?? '').includes(key)) return null;
    used.add(key);
    return key;
  });
  const keys = [...own];
  const order = cells
    .map((c, i) => ({ c, i, held: c.pinned || c.manual }))
    .sort((a, b) => Number(b.held) - Number(a.held) || a.i - b.i);
  for (const { c, i, held } of order) {
    if (own[i] || !c.projectPath) continue;
    const list = tabsOf(c.projectPath);
    const candidates = pick ? pick(c.projectPath, held, list) : [activeOf(c.projectPath), ...list];
    const key = candidates.find((k) => !!k && list.includes(k) && !used.has(k));
    if (key) used.add(key);
    keys[i] = key ?? null;
  }
  return keys;
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
