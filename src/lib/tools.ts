import { plural } from './dashboard';
import type { ToggleTarget, ToolItem, ToolKind } from './types';

export interface ToolCopyRef {
  project: string;
  path: string;
  file: string | null;
}

export interface ProjectOff {
  project: string;
  target: ToggleTarget;
}

export interface ToolEntry extends ToolItem {
  copies: ToolCopyRef[];
  projectOff: ProjectOff[];
  installed: number | null;
  npx: boolean;
}

export interface ToolUsage {
  count: number;
  last: number | null;
  days: [number, number][];
  projects: [string, number][];
}

export interface ToolRuns {
  start: number | null;
  usage: Record<string, ToolUsage>;
}

export interface ToolUpdate {
  id: string;
  current: string;
  latest: string;
  url: string | null;
}

export interface UpdateCheck {
  updates: ToolUpdate[];
  errors: string[];
}

export const DAY = 86_400_000;
export const STALE_DAYS = 30;
export const KINDS: [ToolKind, string][] = [
  ['skill', 'Skills'],
  ['plugin', 'Plugins'],
  ['command', 'Commands'],
  ['mcp', 'MCP'],
  ['agent', 'Agents'],
];

const dayNo = (t: number) => Math.floor(t / DAY);

export function projectsOf(e: ToolEntry): string[] {
  return [...new Set(e.copies.map((c) => c.project))];
}

export function sourceLabel(e: ToolEntry): string {
  if (e.copies.length) {
    const p = projectsOf(e);
    return p.length === 1 ? `проект ${p[0]}` : `проекты · ${p.length}`;
  }
  if (e.origin === 'plugin' && e.kind !== 'plugin')
    return `plugin ${e.qualifiedName.split(':')[0]}`;
  return 'глобальный';
}

export function measurable(e: ToolEntry): boolean {
  if (e.kind !== 'plugin') return true;
  const c = e.plugin?.contents;
  return !!c && c.skills + c.commands + c.agents + c.mcp > 0;
}

export function historyDays(start: number | null, now: number): number {
  return start === null ? 0 : dayNo(now) - dayNo(start) + 1;
}

export function isStale(
  e: ToolEntry,
  u: ToolUsage | undefined,
  start: number | null,
  now: number,
): boolean {
  if (!measurable(e) || (e.kind === 'plugin' && (e.plugin?.contents.hooks ?? 0) > 0)) return false;
  if (historyDays(start, now) < STALE_DAYS) return false;
  const old = !u?.last || now - u.last > STALE_DAYS * DAY;
  return old && now - (e.installed ?? start ?? now) > STALE_DAYS * DAY;
}

const MONTHS = [
  'янв.',
  'февр.',
  'марта',
  'апр.',
  'мая',
  'июня',
  'июля',
  'авг.',
  'сент.',
  'окт.',
  'нояб.',
  'дек.',
];

export function shortDate(t: number): string {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function ago(t: number | null, now: number): string {
  if (t === null) return 'не запускался';
  const local = (x: number) => {
    const d = new Date(x);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;
  };
  const n = local(now) - local(t);
  if (n <= 0) return 'сегодня';
  if (n === 1) return 'вчера';
  if (n < STALE_DAYS) return `${n} ${plural(n, 'день', 'дня', 'дней')} назад`;
  return shortDate(t);
}

export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function pluginParts(e: ToolEntry): string {
  const c = e.plugin?.contents;
  if (!c) return '';
  const out: string[] = [];
  if (c.skills) out.push(`${c.skills} skills`);
  if (c.commands) out.push(`${c.commands} commands`);
  if (c.agents) out.push(`${c.agents} agents`);
  if (c.mcp) out.push(`${c.mcp} MCP`);
  if (c.hooks) out.push('hooks');
  return out.join(' · ') || 'LSP';
}

export type ToolsFilter = 'all' | 'stale' | 'off' | 'upd';
