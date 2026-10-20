import type { GitState, GitStatus, Limit, ProcessRow, Usage } from './types';

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
    .map((t) => (/^[A-Za-z]:[\\/]|^[\\/]/.test(t) ? (t.split(/[\\/]+/).pop() ?? t) : t))
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

export interface ProcessGroup {
  key: string | null;
  rows: ProcessRow[];
  memory: number;
}

export function groupProcesses(rows: ProcessRow[]): {
  stray: ProcessRow[];
  groups: ProcessGroup[];
} {
  const stray = rows.filter((r) => r.orphan).sort((a, b) => b.memory - a.memory);
  const map = new Map<string | null, ProcessRow[]>();
  for (const r of rows) {
    if (r.orphan) continue;
    const list = map.get(r.projectPath) ?? [];
    list.push(r);
    map.set(r.projectPath, list);
  }
  const groups = [...map.entries()]
    .map(([key, list]) => ({
      key,
      rows: list.sort((a, b) => b.memory - a.memory),
      memory: list.reduce((s, r) => s + r.memory, 0),
    }))
    .sort((a, b) => b.memory - a.memory);
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
