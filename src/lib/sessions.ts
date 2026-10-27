import { formatBytes } from './projects';
import { type SessionMeta, sessionDisplayTitle } from './types';

export function sessionSubject(s: SessionMeta) {
  return {
    title: sessionDisplayTitle(s),
    id: s.sessionId.slice(0, 8),
    chips: [`${s.messageCount} сообщ.`, formatBytes(s.sizeBytes)],
  };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return '<1с';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}с`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}м ${seconds % 60}с`;
  const hours = Math.floor(minutes / 60);
  return `${hours}ч ${minutes % 60}м`;
}

function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(iso: string | null): string {
  const d = parse(iso);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
}

function shortDate(d: Date, now: Date): string {
  const month = d.toLocaleString('ru-RU', { month: 'short' }).replace('.', '');
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${month}${year}`;
}

export function formatDateTime(iso: string | null, now = new Date()): string {
  const d = parse(iso);
  return d ? `${shortDate(d, now)} ${formatTime(iso)}` : '—';
}

export interface DayLabel {
  key: string;
  lead: string | null;
  date: string;
}

export function dayLabel(iso: string | null, now = new Date()): DayLabel {
  const d = parse(iso);
  if (!d) return { key: 'none', lead: null, date: 'Без даты' };
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round(
    (today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000,
  );
  const lead = days === 0 ? 'Сегодня' : days === 1 ? 'Вчера' : null;
  return { key, lead, date: shortDate(d, now) };
}

export function splitTitle(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return ['', name.trim()];
  const last = words.pop() ?? '';
  return [`${words.join(' ')} `, last];
}
