import { describe, expect, it } from 'vitest';
import {
  indexTooLong,
  matchesRecord,
  plural,
  type RecordFilter,
  sortRecords,
  splitFrontmatter,
} from './memory';
import type { MemoryRecord } from './types';

const rec = (over: Partial<MemoryRecord>): MemoryRecord => ({
  path: `C:/m/${over.name ?? 'x'}.md`,
  file: `${over.name ?? 'x'}.md`,
  name: 'x',
  description: '',
  type: 'project',
  kind: null,
  status: 'observation',
  seen: 1,
  importance: 2,
  tags: [],
  files: [],
  supersedes: null,
  validTo: null,
  consolidatedInto: null,
  stale: false,
  updated: '2026-09-29',
  archived: false,
  error: null,
  ...over,
});

const all: RecordFilter = { kind: 'all', status: 'all', query: '' };

describe('matchesRecord', () => {
  it('filters by kind, status, stale and query', () => {
    const g = rec({ name: 'g', kind: 'gotcha', description: 'Грабли с Git Bash', status: 'fact' });
    const old = rec({ name: 'o', updated: '2026-01-01', stale: true });
    expect(matchesRecord(g, { ...all, kind: 'gotcha' })).toBe(true);
    expect(matchesRecord(old, { ...all, kind: 'other' })).toBe(true);
    expect(matchesRecord(g, { ...all, status: 'observation' })).toBe(false);
    expect(matchesRecord(old, { ...all, status: 'stale' })).toBe(true);
    expect(matchesRecord(g, { ...all, query: 'git bash' })).toBe(true);
    expect(matchesRecord(g, { ...all, query: 'нет такого' })).toBe(false);
  });
});

describe('sortRecords', () => {
  it('puts pinned and facts first, stale last, then newest', () => {
    const out = sortRecords([
      rec({ name: 'stale', stale: true, importance: 3 }),
      rec({ name: 'obs-new', updated: '2026-09-29' }),
      rec({ name: 'obs-old', updated: '2026-09-01' }),
      rec({ name: 'fact', status: 'fact' }),
      rec({ name: 'pinned', importance: 3 }),
    ]);
    expect(out.map((r) => r.name)).toEqual(['pinned', 'fact', 'obs-new', 'obs-old', 'stale']);
  });
});

describe('index', () => {
  it('flags a long index', () => {
    expect([indexTooLong(200), indexTooLong(201)]).toEqual([false, true]);
  });
});

describe('memory helpers', () => {
  it('splits frontmatter from body', () => {
    expect(splitFrontmatter('---\na: 1\n---\nbody')).toEqual({ front: 'a: 1', body: 'body' });
    expect(splitFrontmatter('no front').body).toBe('no front');
  });

  it('picks russian plural forms', () => {
    expect([1, 2, 5, 11, 21].map((n) => plural(n, 'запись', 'записи', 'записей'))).toEqual([
      'запись',
      'записи',
      'записей',
      'записей',
      'запись',
    ]);
  });
});
