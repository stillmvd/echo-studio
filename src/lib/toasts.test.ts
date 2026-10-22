import { describe, expect, it } from 'vitest';
import {
  marksOf,
  pickToasts,
  rememberToast,
  TOAST_GAP_MS,
  TOAST_TARGET_MS,
  takeActivation,
} from './toasts';
import type { ClaudeSession, DevServer, SessionStatus } from './types';
import { devHealth, devStatusLabel, runningGroups } from './workbench';

const session = (id: string, status: SessionStatus, kind: ClaudeSession['kind'] = 'shell') =>
  ({
    sessionId: id,
    shortId: null,
    kind,
    projectPath: 'C:/P',
    cwd: 'C:/P',
    name: id === 'a' ? 'Фикс' : null,
    status,
    phase: null,
    tool: null,
    since: 1,
    pid: null,
    transcript: null,
    exitedAt: null,
    shells: false,
  }) satisfies ClaudeSession;

const dev = (over: Partial<DevServer> = {}): DevServer => ({
  projectPath: 'C:/P',
  command: 'npm run dev',
  state: 'running',
  ports: [9000],
  startedAt: 0,
  exitCode: null,
  log: '',
  pids: [1],
  errors: null,
  restarted: false,
  ...over,
});

const run = (
  before: { sessions: ClaudeSession[]; devs: DevServer[] },
  after: { sessions: ClaudeSession[]; devs: DevServer[] },
  opts: { unseen?: (tab: string) => boolean; last?: Map<string, number>; now?: number } = {},
) =>
  pickToasts({
    prev: marksOf(before.sessions, before.devs),
    sessions: after.sessions,
    devs: after.devs,
    name: () => 'P',
    unseen: opts.unseen ?? (() => true),
    last: opts.last ?? new Map(),
    now: opts.now ?? 100_000,
  });

describe('dev health', () => {
  it('tells a crash from build errors and labels both', () => {
    const crashed = dev({ state: 'error', exitCode: 1, ports: [] });
    expect(devHealth(crashed)).toBe('crashed');
    expect(devStatusLabel(crashed)).toBe('упал · код 1');
    expect(devStatusLabel({ ...crashed, restarted: true })).toBe('упал снова · код 1');
    const broken = dev({ errors: { count: 2, at: 'src/a.ts:3' } });
    expect(devHealth(broken)).toBe('errors');
    expect(devStatusLabel(broken)).toBe('2 ошибки');
    expect(devStatusLabel(dev())).toBe(':9000');
  });

  it('puts a project whose dev has build errors above a quiet one', () => {
    const groups = runningGroups(
      [session('q', 'idle')].map((s) => ({ ...s, projectPath: 'C:/Q' })),
      [dev({ errors: { count: 1, at: null } })],
      {},
    );
    expect(groups.map((g) => g.path)).toEqual(['C:/P', 'C:/Q']);
  });
});

describe('toasts', () => {
  it('fires on waiting, on a finished answer and on a dev crash only', () => {
    const toasts = run(
      { sessions: [session('a', 'working'), session('b', 'working')], devs: [dev()] },
      {
        sessions: [session('a', 'waiting'), session('b', 'done')],
        devs: [dev({ state: 'error', exitCode: 1, ports: [] })],
      },
    );
    expect(toasts.map((t) => [t.tab, t.body])).toEqual([
      ['a', 'Фикс — ждёт ответа'],
      ['b', 'Claude — закончил задачу'],
      ['dev:C:/P', 'dev упал · код 1 — npm run dev'],
    ]);
  });

  it('stays quiet for build errors, first sight, external sessions and visible tabs', () => {
    expect(
      run(
        { sessions: [], devs: [dev()] },
        { sessions: [], devs: [dev({ errors: { count: 1, at: null } })] },
      ),
    ).toEqual([]);
    expect(
      run({ sessions: [], devs: [] }, { sessions: [session('a', 'waiting')], devs: [] }),
    ).toEqual([]);
    expect(
      run(
        { sessions: [session('a', 'working', 'external')], devs: [] },
        { sessions: [session('a', 'waiting', 'external')], devs: [] },
      ),
    ).toEqual([]);
    expect(
      run(
        { sessions: [session('a', 'working')], devs: [] },
        { sessions: [session('a', 'waiting')], devs: [] },
        { unseen: () => false },
      ),
    ).toEqual([]);
  });

  it('tells about an automatic restart once', () => {
    const restarted = dev({ state: 'starting', ports: [], restarted: true, startedAt: 5 });
    const toasts = run({ sessions: [], devs: [dev()] }, { sessions: [], devs: [restarted] });
    expect(toasts.map((t) => t.body)).toEqual(['dev упал, Echo запустил его снова — npm run dev']);
    expect(run({ sessions: [], devs: [restarted] }, { sessions: [], devs: [restarted] })).toEqual(
      [],
    );
  });

  it('sends at most one toast per tab in ten seconds', () => {
    const last = new Map<string, number>();
    const flip = (now: number) =>
      run(
        { sessions: [session('a', 'working')], devs: [] },
        { sessions: [session('a', 'waiting')], devs: [] },
        { last, now },
      ).length;
    expect(flip(100_000)).toBe(1);
    expect(flip(100_000 + TOAST_GAP_MS - 1)).toBe(0);
    expect(flip(100_000 + TOAST_GAP_MS)).toBe(1);
  });

  it('activation opens the tab of the last recent toast once', () => {
    const toast = { path: 'C:/P', tab: 'a', title: 'P', body: '', at: 1_000 };
    rememberToast(toast);
    expect(takeActivation(1_000 + TOAST_TARGET_MS)).toEqual(toast);
    expect(takeActivation(1_000 + TOAST_TARGET_MS)).toBeNull();
    rememberToast(toast);
    expect(takeActivation(1_001 + TOAST_TARGET_MS)).toBeNull();
  });
});
