import { describe, expect, it } from 'vitest';
import {
  ago,
  DAY,
  formatCount,
  isStale,
  sourceLabel,
  type ToolEntry,
  type ToolUsage,
} from './tools';

const NOW = Date.parse('2026-10-28T12:00:00');
const START = NOW - 45 * DAY;

function entry(over: Partial<ToolEntry> = {}): ToolEntry {
  return {
    id: 'skill:user:x',
    kind: 'skill',
    name: 'x',
    qualifiedName: 'x',
    description: null,
    origin: 'user',
    pluginKey: null,
    filePath: null,
    state: 'enabled',
    overrideMode: null,
    toggle: null,
    toggleHint: null,
    conflict: 'none',
    overriddenBy: null,
    overrides: [],
    error: null,
    frontMatter: null,
    plugin: null,
    mcp: null,
    copies: [],
    projectOff: [],
    installed: START,
    npx: false,
    ...over,
  };
}
const used = (daysAgo: number): ToolUsage => ({
  count: 1,
  last: NOW - daysAgo * DAY,
  days: [],
  projects: [],
});
const contents = (o: Partial<{ skills: number; hooks: number }>) => ({
  version: '1',
  marketplace: 'm',
  installedAt: null,
  lastUpdated: null,
  installPath: '',
  contents: { skills: 0, commands: 0, agents: 0, mcp: 0, hooks: 0, ...o },
});

describe('isStale', () => {
  it('needs 30 days without runs, old install and 30 days of history', () => {
    expect(isStale(entry(), undefined, START, NOW)).toBe(true);
    expect(isStale(entry(), used(31), START, NOW)).toBe(true);
    expect(isStale(entry(), used(29), START, NOW)).toBe(false);
    expect(isStale(entry({ installed: NOW - 10 * DAY }), undefined, START, NOW)).toBe(false);
    expect(isStale(entry(), undefined, NOW - 20 * DAY, NOW)).toBe(false);
    expect(isStale(entry({ installed: null }), undefined, START, NOW)).toBe(true);
  });

  it('never marks unmeasured or hook plugins', () => {
    expect(isStale(entry({ kind: 'plugin', plugin: contents({}) }), undefined, START, NOW)).toBe(
      false,
    );
    expect(
      isStale(
        entry({ kind: 'plugin', plugin: contents({ skills: 3, hooks: 2 }) }),
        undefined,
        START,
        NOW,
      ),
    ).toBe(false);
    expect(
      isStale(entry({ kind: 'plugin', plugin: contents({ skills: 3 }) }), undefined, START, NOW),
    ).toBe(true);
  });
});

describe('labels', () => {
  it('names the source like Claude Code', () => {
    expect(sourceLabel(entry())).toBe('глобальный');
    expect(sourceLabel(entry({ origin: 'plugin', qualifiedName: 'chisle:chisle-review' }))).toBe(
      'plugin chisle',
    );
    const copy = (project: string) => ({ project, path: `C:\\P\\${project}`, file: null });
    expect(sourceLabel(entry({ copies: [copy('A')] }))).toBe('проект A');
    expect(sourceLabel(entry({ copies: [copy('A'), copy('B'), copy('B')] }))).toBe('проекты · 2');
  });

  it('says when it ran', () => {
    expect(ago(null, NOW)).toBe('не запускался');
    expect(ago(NOW - 60_000, NOW)).toBe('сегодня');
    expect(ago(NOW - DAY, NOW)).toBe('вчера');
    expect(ago(NOW - 3 * DAY, NOW)).toBe('3 дня назад');
    expect(ago(NOW - 21 * DAY, NOW)).toBe('21 день назад');
    expect(ago(Date.parse('2026-09-12T12:00:00'), NOW)).toBe('12 сент.');
    expect(formatCount(18928)).toBe('18 928');
  });
});
