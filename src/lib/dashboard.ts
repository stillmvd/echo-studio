import type { Limit, ModelTokens, OtherProcess, ProcessRow, Usage, UsageSummary } from './types';

export const FIVE_HOURS = 5 * 3600;
export const WEEK = 7 * 86_400;
const MIN_ELAPSED = 15 * 60;

export type Tone = 'ok' | 'warn' | 'bad';

export function tone(value: number, warn = 60, bad = 85): Tone {
  if (value >= bad) return 'bad';
  return value >= warn ? 'warn' : 'ok';
}

const one = (n: number) => n.toFixed(1).replace('.', ',').replace(/,0$/, '');

export function tok(n: number): string {
  if (n >= 1e9) return `${one(n / 1e9)} млрд`;
  if (n >= 1e6) return `${one(n / 1e6)} млн`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} тыс`;
  return String(Math.round(n));
}

export function pct(n: number): string {
  return n >= 10 ? `${Math.round(n)}%` : `${one(n)}%`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m = n % 10;
  const h = n % 100;
  if (m === 1 && h !== 11) return one;
  if (m >= 2 && m <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

export interface Forecast {
  projected: number;
  exhaustAt: number | null;
}

export function forecast(limit: Limit | null, window: number, now = Date.now()): Forecast | null {
  if (!limit || limit.reset) return null;
  const nowSec = now / 1000;
  if (limit.resetsAt <= nowSec) return null;
  const elapsed = nowSec - (limit.resetsAt - window);
  if (elapsed < MIN_ELAPSED || limit.usedPercentage <= 0) return null;
  const rate = limit.usedPercentage / elapsed;
  const projected = rate * window;
  if (projected < 100) return { projected, exhaustAt: null };
  const left = Math.max(0, 100 - limit.usedPercentage) / rate;
  return { projected: 100, exhaustAt: (nowSec + left) * 1000 };
}

function clock(ms: number, now: number): string {
  const at = new Date(ms);
  const time = at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return at.toDateString() === new Date(now).toDateString()
    ? time
    : `${at.toLocaleDateString('ru-RU', { weekday: 'short' })} ${time}`;
}

export function forecastText(f: Forecast | null, now = Date.now()): string | null {
  if (!f) return null;
  if (f.exhaustAt !== null) return `кончится ≈ ${clock(f.exhaustAt, now)}`;
  return `к сбросу ≈ ${Math.round(f.projected)}%`;
}

export function resetAt(limit: Limit | null, now = Date.now()): string {
  if (!limit) return 'нет данных';
  if (limit.reset || limit.resetsAt * 1000 <= now) return 'сброшен';
  return `сброс ${clock(limit.resetsAt * 1000, now)}`;
}

export function limitTone(limit: Limit | null, f: Forecast | null): Tone {
  if (!limit) return 'ok';
  if (f && f.projected >= 100) return 'bad';
  return tone(Math.max(limit.usedPercentage, f?.projected ?? 0));
}

export function todayWeekShare(
  s: UsageSummary,
  week: Limit | null,
  now = Date.now(),
): number | null {
  if (!week || week.reset || week.resetsAt * 1000 <= now || s.windowWeight <= 0) return null;
  return (week.usedPercentage * s.todayWeight) / s.windowWeight;
}

export interface ProjectToday {
  path: string;
  usage: Usage;
  share: number;
}

export function todayProjects(usage: Record<string, Usage> | undefined, n = 5): ProjectToday[] {
  const list = Object.entries(usage ?? {}).filter(([, u]) => u.todayWeight > 0);
  const total = list.reduce((a, [, u]) => a + u.todayWeight, 0);
  return list
    .sort((a, b) => b[1].todayWeight - a[1].todayWeight)
    .slice(0, n)
    .map(([path, u]) => ({ path, usage: u, share: u.todayWeight / total }));
}

export function cacheShare(u: Usage): number {
  return u.todayWeight > 0 ? Math.min(1, (u.todayCacheRead * 2) / u.todayWeight) : 0;
}

export function hourLabels(nowHour: number): [number, number][] {
  return Array.from({ length: 24 }, (_, i): [number, number] => [i, (nowHour + 1 + i) % 24]).filter(
    ([i, h]) => h % 6 === 0 && i < 21,
  );
}

export function modelName(id: string): string {
  const parts = id
    .replace(/^claude-/, '')
    .split('-')
    .filter((p) => p.length < 8);
  const [family, ...version] = parts;
  if (!family || /^\d/.test(family)) return id;
  return [family[0]?.toUpperCase() + family.slice(1), version.join('.')].filter(Boolean).join(' ');
}

export function topModels(models: ModelTokens[], n = 3): [string, number][] {
  const top: [string, number][] = models.slice(0, n).map((m) => [modelName(m.model), m.tokens]);
  const rest = models.slice(n).reduce((s, m) => s + m.tokens, 0);
  return rest > 0 ? [...top, ['Другие', rest]] : top;
}

export interface SessionLoad {
  sessionId: string;
  projectPath: string | null;
  rows: ProcessRow[];
  memory: number;
  cpu: number;
}

export function sessionLoads(rows: ProcessRow[]): SessionLoad[] {
  const map = new Map<string, SessionLoad>();
  for (const r of rows) {
    if (!r.session || r.orphan) continue;
    const s = map.get(r.session) ?? {
      sessionId: r.session,
      projectPath: r.projectPath,
      rows: [],
      memory: 0,
      cpu: 0,
    };
    s.rows.push(r);
    s.memory += r.memory;
    s.cpu += r.cpu;
    s.projectPath ??= r.projectPath;
    map.set(r.session, s);
  }
  for (const s of map.values()) s.rows.sort((a, b) => b.memory - a.memory);
  return [...map.values()].sort((a, b) => b.memory - a.memory);
}

export interface MemorySegment {
  key: string;
  label: string;
  memory: number;
  kind: 'claude' | 'orphans' | 'other' | 'rest' | 'free';
}

export function memoryStack(
  claude: number,
  orphans: number,
  others: OtherProcess[],
  used: number,
  total: number,
  top = 3,
): MemorySegment[] {
  const shown = others.slice(0, top);
  const rest = Math.max(0, used - claude - orphans - shown.reduce((s, o) => s + o.memory, 0));
  const segs: MemorySegment[] = [
    { key: 'claude', label: 'Claude', memory: claude, kind: 'claude' },
  ];
  if (orphans > 0) segs.push({ key: 'orphans', label: 'Сироты', memory: orphans, kind: 'orphans' });
  for (const o of shown)
    segs.push({
      key: o.name,
      label: o.name.replace(/\.exe$/i, ''),
      memory: o.memory,
      kind: 'other',
    });
  segs.push({ key: 'rest', label: 'Прочее', memory: rest, kind: 'rest' });
  segs.push({ key: 'free', label: 'Свободно', memory: Math.max(0, total - used), kind: 'free' });
  return segs;
}

export function sparkPoints(values: number[], w: number, h: number, floor = 1): string {
  if (values.length < 2) return '';
  const max = Math.max(floor, ...values);
  return values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 1 - (v / max) * (h - 2)).toFixed(1)}`,
    )
    .join(' ');
}

export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short' });
}
