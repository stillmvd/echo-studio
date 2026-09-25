import type { ProjectSort } from '@/state/ui-store';
import type { ConversationProject } from './types';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const minutes = Math.floor(Math.max(0, now - t) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function parentFolder(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.length >= 2 ? (parts[parts.length - 2] ?? '') : '';
}

export function sortProjects(
  projects: ConversationProject[],
  sort: ProjectSort,
): ConversationProject[] {
  const sorted = [...projects];
  switch (sort) {
    case 'name':
      return sorted.sort((a, b) => a.displayName.localeCompare(b.displayName));
    case 'sessions':
      return sorted.sort((a, b) => b.sessionCount - a.sessionCount);
    case 'size':
      return sorted.sort((a, b) => b.totalSize - a.totalSize);
    case 'recent':
      return sorted.sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''));
  }
}

export function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const month = d.toLocaleString('en', { month: 'short' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${month} ${hh}:${mm}`;
}
