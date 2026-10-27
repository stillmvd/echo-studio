import { describe, expect, it } from 'vitest';
import {
  cacheShare,
  FIVE_HOURS,
  forecast,
  hourLabels,
  limitTone,
  memoryStack,
  modelName,
  plural,
  sessionLoads,
  todayProjects,
  todayWeekShare,
  tok,
  topModels,
  WEEK,
} from './dashboard';
import type { ProcessRow, Usage, UsageSummary } from './types';

const NOW = Date.UTC(2026, 9, 27, 7, 0);
const reset = (inSec: number) => NOW / 1000 + inSec;

function row(p: Partial<ProcessRow>): ProcessRow {
  return {
    pid: 1,
    startTime: 0,
    name: 'node.exe',
    memory: 0,
    cpu: 0,
    commandLine: '',
    projectPath: null,
    session: null,
    orphan: null,
    guard: null,
    ...p,
  };
}

describe('forecast', () => {
  it('projects the pace to the reset', () => {
    const f = forecast(
      { usedPercentage: 10, resetsAt: reset(2.5 * 3600), reset: false },
      FIVE_HOURS,
      NOW,
    );
    expect(f?.projected).toBeCloseTo(20);
    expect(f?.exhaustAt).toBeNull();
  });

  it('gives the exhaustion time when the pace runs past 100%', () => {
    const f = forecast(
      { usedPercentage: 80, resetsAt: reset(3 * 3600), reset: false },
      FIVE_HOURS,
      NOW,
    );
    expect(f?.projected).toBe(100);
    expect(f?.exhaustAt).toBe(NOW + 30 * 60_000);
  });

  it('skips a window that has barely started or already reset', () => {
    expect(
      forecast({ usedPercentage: 5, resetsAt: reset(WEEK - 60), reset: false }, WEEK, NOW),
    ).toBeNull();
    expect(
      forecast({ usedPercentage: 5, resetsAt: reset(-1), reset: false }, WEEK, NOW),
    ).toBeNull();
    expect(forecast(null, WEEK, NOW)).toBeNull();
  });

  it('colours by the worse of usage and projection', () => {
    const limit = { usedPercentage: 77, resetsAt: reset(32 * 3600), reset: false };
    const f = forecast(limit, WEEK, NOW);
    expect(Math.round(f?.projected ?? 0)).toBe(95);
    expect(limitTone(limit, f)).toBe('bad');
    expect(limitTone({ ...limit, usedPercentage: 10 }, { projected: 19, exhaustAt: null })).toBe(
      'ok',
    );
  });
});

describe('formatting', () => {
  it('shortens token counts', () => {
    expect(tok(93_449_778)).toBe('93,4 млн');
    expect(tok(983_419)).toBe('983 тыс');
    expect(tok(6_707_569_848)).toBe('6,7 млрд');
    expect(tok(2_000_000)).toBe('2 млн');
  });

  it('declines nouns by number', () => {
    const p = (n: number) => plural(n, 'сессия', 'сессии', 'сессий');
    expect([1, 2, 5, 11, 21, 22, 112].map(p)).toEqual([
      'сессия',
      'сессии',
      'сессий',
      'сессий',
      'сессия',
      'сессии',
      'сессий',
    ]);
  });

  it('names models', () => {
    expect(modelName('claude-opus-5-5')).toBe('Opus 5.5');
    expect(modelName('claude-fable-5-1')).toBe('Fable 5.1');
    expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
    expect(modelName('claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
  });

  it('folds the tail of models into Другие', () => {
    const models = ['a', 'b', 'c', 'd', 'e'].map((m, i) => ({
      model: `claude-${m}`,
      tokens: 10 - i,
    }));
    expect(topModels(models)).toEqual([
      ['A', 10],
      ['B', 9],
      ['C', 8],
      ['Другие', 13],
    ]);
  });
});

describe('sessionLoads', () => {
  it('sums memory and cpu per live session and skips hanging processes', () => {
    const loads = sessionLoads([
      row({ pid: 1, session: 's1', memory: 100, cpu: 1, projectPath: 'P' }),
      row({ pid: 2, session: 's1', memory: 300, cpu: 2 }),
      row({ pid: 3, session: 's2', memory: 50 }),
      row({ pid: 4, session: 's1', memory: 999, orphan: { reason: 'session-closed' } }),
      row({ pid: 5, memory: 70 }),
    ]);
    expect(loads.map((s) => [s.sessionId, s.memory, s.cpu, s.projectPath])).toEqual([
      ['s1', 400, 3, 'P'],
      ['s2', 50, 0, null],
    ]);
    expect(loads[0]?.rows.map((r) => r.pid)).toEqual([2, 1]);
  });
});

describe('memoryStack', () => {
  it('splits used memory and keeps the rest non-negative', () => {
    const segs = memoryStack(
      400,
      0,
      [
        { name: 'chrome.exe', count: 3, memory: 300, cpu: 0 },
        { name: 'a', count: 1, memory: 100, cpu: 0 },
      ],
      1000,
      1600,
      1,
    );
    expect(segs.map((s) => [s.label, s.memory])).toEqual([
      ['Claude', 400],
      ['chrome', 300],
      ['Прочее', 300],
      ['Свободно', 600],
    ]);
  });
});

describe('token card', () => {
  const summary = (todayWeight: number, windowWeight: number) =>
    ({ todayWeight, windowWeight }) as UsageSummary;
  const usage = (todayWeight: number): Usage => ({
    week: 0,
    today: 0,
    sessions: 0,
    days: {},
    todayWeight,
    todayCacheRead: 0,
    todaySessions: 0,
  });

  it('splits the week percentage by today’s share of the window', () => {
    const week = { usedPercentage: 80, resetsAt: reset(3600), reset: false };
    expect(todayWeekShare(summary(25, 1000), week, NOW)).toBe(2);
    expect(todayWeekShare(summary(25, 0), week, NOW)).toBeNull();
    expect(todayWeekShare(summary(25, 1000), { ...week, resetsAt: reset(-1) }, NOW)).toBeNull();
    expect(todayWeekShare(summary(25, 1000), null, NOW)).toBeNull();
  });

  it('ranks today’s projects by weight and drops idle ones', () => {
    const top = todayProjects({ A: usage(1), B: usage(3), C: usage(0) });
    expect(top.map((p) => [p.path, p.share])).toEqual([
      ['B', 0.75],
      ['A', 0.25],
    ]);
  });

  it('weighs cache reads at their price share', () => {
    expect(cacheShare({ ...usage(1000), todayCacheRead: 250 })).toBe(0.5);
    expect(cacheShare({ ...usage(100), todayCacheRead: 250 })).toBe(1);
    expect(cacheShare(usage(0))).toBe(0);
  });

  it('labels every sixth hour and keeps clear of “now”', () => {
    expect(hourLabels(13)).toEqual([
      [4, 18],
      [10, 0],
      [16, 6],
    ]);
    expect(hourLabels(23).map(([, h]) => h)).toEqual([0, 6, 12, 18]);
  });
});
