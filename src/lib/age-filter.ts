import type { SessionMeta } from './types';

export type AgeFilter = 'all' | 'older30' | 'older90' | 'older365';

export function olderThanDays(filter: AgeFilter): number | null {
  switch (filter) {
    case 'all':
      return null;
    case 'older30':
      return 30;
    case 'older90':
      return 90;
    case 'older365':
      return 365;
  }
}

export function applyAgeFilter(sessions: SessionMeta[], filter: AgeFilter): SessionMeta[] {
  const days = olderThanDays(filter);
  if (days === null) return sessions;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => {
    if (!s.lastEventAt) return true;
    const t = Date.parse(s.lastEventAt);
    if (Number.isNaN(t)) return true;
    return t < cutoff;
  });
}
