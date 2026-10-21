import type { ClaudeSession, GitState, GitStatus, Limit, ProcessRow, Usage } from './types';
import { type StatusView, samePath, statusView, URGENCY, urgency } from './workbench';

const MB = 1024 * 1024;

export function mb(bytes: number): string {
  const m = Math.round(bytes / MB);
  return m >= 1000 ? `${(m / 1024).toFixed(1).replace('.', ',')} ГБ` : `${m} МБ`;
}

export function mt(tokens: number): string {
  return `${(tokens / 1e6).toFixed(1).replace('.', ',')}M`;
}

export function resetText(limit: Limit | null, weekly: boolean, now = Date.now()): string {
  if (!limit) return 'нет данных';
  if (limit.reset || limit.resetsAt * 1000 <= now) return 'сброшен';
  const at = new Date(limit.resetsAt * 1000);
  const time = at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return weekly
    ? `сброс ${at.toLocaleDateString('ru-RU', { weekday: 'short' })} ${time}`
    : `сброс в ${time}`;
}

export function percent(limit: Limit | null, now = Date.now()): number | null {
  if (!limit || limit.reset || limit.resetsAt * 1000 <= now) return null;
  return Math.round(limit.usedPercentage);
}

export function isStatus(state: GitState | null | undefined): state is GitStatus {
  return !!state && !('error' in state);
}

export function gitText(state: GitState | null | undefined): string {
  if (state === undefined) return '';
  if (state === null) return 'без git';
  if (!isStatus(state)) return 'ошибка git';
  const parts = [state.dirty ? `±${state.dirty}` : 'чисто'];
  if (state.ahead) parts.push(`↑${state.ahead}`);
  return parts.join(' ');
}

export function ago(ms: number, now = Date.now()): string {
  const min = Math.max(1, Math.round((now - ms) / 60_000));
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
}

export function args(commandLine: string): string {
  const tokens = commandLine.match(/"[^"]*"|\S+/g) ?? [];
  const rest = tokens
    .slice(1)
    .map((t) => t.replace(/^"|"$/g, ''))
    .map((t) => {
      const path = /^[A-Za-z]:[\\/][^\\/]/.test(t) || /^[\\/][^\\/]+[\\/]/.test(t);
      if (!path || t.includes('://')) return t;
      return (
        t
          .split(/[\\/]+/)
          .filter(Boolean)
          .pop() || t
      );
    })
    .join(' ');
  return rest || commandLine;
}

export function nameOf(path: string | null): string {
  if (!path) return 'Вне проектов';
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function describe(row: ProcessRow, now = Date.now()): string {
  const o = row.orphan;
  if (!o)
    return row.session && row.name.toLowerCase() === 'claude.exe'
      ? 'сессия Claude'
      : args(row.commandLine);
  const project = row.projectPath ? `${nameOf(row.projectPath)} · ` : '';
  if (o.reason === 'session-closed') {
    return `${project}сессия закрыта${o.since ? ` ${ago(o.since, now)}` : ''}`;
  }
  if (o.reason === 'duplicate') return `${project}второй экземпляр`;
  return `вне проектов · ${args(row.commandLine)}`;
}

export type GroupSession = Pick<
  ClaudeSession,
  'sessionId' | 'name' | 'status' | 'since' | 'phase' | 'tool'
>;

export interface SessionGroup {
  sessionId: string;
  name: string;
  status: StatusView | null;
  phase: ClaudeSession['phase'];
  tool: string | null;
  rows: ProcessRow[];
  memory: number;
}

export interface ProcessGroup {
  key: string | null;
  rows: ProcessRow[];
  sessions: SessionGroup[];
  memory: number;
}

const heavier = (a: { memory: number }, b: { memory: number }) => b.memory - a.memory;
const total = (rows: ProcessRow[]) => rows.reduce((s, r) => s + r.memory, 0);

export function orphans(rows: ProcessRow[]): ProcessRow[] {
  return rows.filter((r) => r.orphan && !r.guard).sort(heavier);
}

export function groupName(path: string | null, root: string): string {
  return path && samePath(path, root) ? ROOT_GROUP : nameOf(path);
}

export const ROOT_GROUP = 'Projects (корень)';

function sessionGroups(
  rows: ProcessRow[],
  sessions: GroupSession[],
  seen: Record<string, number>,
): SessionGroup[] {
  const map = new Map<string, ProcessRow[]>();
  for (const r of rows) {
    if (!r.session) continue;
    map.set(r.session, [...(map.get(r.session) ?? []), r]);
  }
  return [...map.entries()]
    .map(([sessionId, list]) => {
      const s = sessions.find((x) => x.sessionId === sessionId);
      return {
        sessionId,
        name: s?.name || `Claude ${sessionId.slice(0, 8)}`,
        status: s ? statusView(s, seen) : null,
        phase: s?.phase ?? null,
        tool: s?.tool ?? null,
        rows: list.sort(heavier),
        memory: total(list),
      };
    })
    .sort(
      (a, b) =>
        (a.status ? urgency(a.status) : URGENCY.length) -
          (b.status ? urgency(b.status) : URGENCY.length) || heavier(a, b),
    );
}

export function groupProcesses(
  rows: ProcessRow[],
  root: string,
  sessions: GroupSession[],
  seen: Record<string, number> = {},
): {
  stray: ProcessRow[];
  groups: ProcessGroup[];
} {
  const stray = rows.filter((r) => r.orphan?.reason === 'no-project').sort(heavier);
  const map = new Map<string | null, ProcessRow[]>();
  for (const r of rows) {
    if (r.orphan?.reason === 'no-project') continue;
    const key = r.projectPath && samePath(r.projectPath, root) ? root : r.projectPath;
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  const groups = [...map.entries()]
    .map(([key, list]) => {
      const own = list.filter((r) => r.session && !r.orphan);
      return {
        key,
        rows: list.filter((r) => !own.includes(r)).sort(heavier),
        sessions: sessionGroups(own, sessions, seen),
        memory: total(list),
      };
    })
    .sort(heavier);
  return { stray, groups };
}

export function topUsage(
  usage: Record<string, Usage> | undefined,
  known: Set<string>,
  limit = 7,
): [string, Usage][] {
  if (!usage) return [];
  return Object.entries(usage)
    .filter(([path]) => known.has(path))
    .sort((a, b) => b[1].week - a[1].week)
    .slice(0, limit);
}
