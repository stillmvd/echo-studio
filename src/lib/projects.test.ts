import { describe, expect, it } from 'vitest';
import { formatAgo, parentFolder, sortProjects } from './projects';
import type { ConversationProject } from './types';

describe('formatAgo', () => {
  const now = Date.parse('2026-09-25T18:00:00Z');
  it('buckets minutes, hours and days', () => {
    expect(formatAgo('2026-09-25T17:59:40Z', now)).toBe('now');
    expect(formatAgo('2026-09-25T17:57:00Z', now)).toBe('3m');
    expect(formatAgo('2026-09-25T11:00:00Z', now)).toBe('7h');
    expect(formatAgo('2026-09-14T18:00:00Z', now)).toBe('11d');
    expect(formatAgo(null, now)).toBe('');
  });
});

describe('parentFolder', () => {
  it('returns the folder above the project', () => {
    expect(parentFolder('C:\\Users\\me\\Projects\\Windows Apps\\Echo Studio')).toBe('Windows Apps');
    expect(parentFolder('C:\\')).toBe('');
  });
});

describe('sortProjects', () => {
  const p = (
    displayName: string,
    sessionCount: number,
    lastActivity: string,
  ): ConversationProject => ({
    id: displayName,
    cwd: displayName,
    displayName,
    sessionCount,
    totalSize: sessionCount,
    lastActivity,
  });
  const list = [
    p('Booked', 45, '2026-09-19'),
    p('Trail', 18, '2026-09-24'),
    p('Cairn', 1, '2026-09-21'),
  ];
  it('orders by recency, name and session count', () => {
    expect(sortProjects(list, 'recent').map((x) => x.displayName)).toEqual([
      'Trail',
      'Cairn',
      'Booked',
    ]);
    expect(sortProjects(list, 'name').map((x) => x.displayName)).toEqual([
      'Booked',
      'Cairn',
      'Trail',
    ]);
    expect(sortProjects(list, 'sessions').map((x) => x.displayName)).toEqual([
      'Booked',
      'Trail',
      'Cairn',
    ]);
  });
});
