import { expect, it, describe as suite } from 'vitest';
import {
  args,
  describe,
  gitText,
  groupName,
  groupProcesses,
  mb,
  mt,
  orphans,
  percent,
  resetText,
  topUsage,
} from './overview';
import type { ProcessRow, Usage } from './types';

const ROOT = 'C:\\P';

const row = (over: Partial<ProcessRow>): ProcessRow => ({
  pid: 1,
  startTime: 0,
  name: 'node.exe',
  memory: 0,
  commandLine: 'node app.js',
  projectPath: null,
  session: null,
  orphan: null,
  guard: null,
  ...over,
});

suite('overview formatting', () => {
  it('formats memory and tokens', () => {
    expect(mb(150 * 1024 * 1024)).toBe('150 МБ');
    expect(mb(2610 * 1024 * 1024)).toBe('2,5 ГБ');
    expect(mt(12_345_678)).toBe('12,3M');
  });

  it('treats past reset as reset and missing file as no data', () => {
    const now = 1_792_512_000_000;
    expect(resetText(null, false, now)).toBe('нет данных');
    expect(
      resetText({ usedPercentage: 90, resetsAt: 1_792_500_000, reset: false }, false, now),
    ).toBe('сброшен');
    expect(percent({ usedPercentage: 81.4, resetsAt: 1_792_515_600, reset: false }, now)).toBe(81);
    expect(percent({ usedPercentage: 81, resetsAt: 1_792_500_000, reset: true }, now)).toBeNull();
  });

  it('describes git state', () => {
    expect(gitText(null)).toBe('без git');
    expect(gitText({ error: 'x' })).toBe('ошибка git');
    expect(gitText({ branch: 'main', dirty: 3, ahead: 2, behind: 0, upstream: true })).toBe(
      '±3 ↑2',
    );
    expect(gitText({ branch: 'main', dirty: 0, ahead: 0, behind: 0, upstream: true })).toBe(
      'чисто',
    );
  });

  it('strips the executable from a command line', () => {
    expect(args('"C:\\Program Files\\nodejs\\node.exe" --watch src/index.ts')).toBe(
      '--watch src/index.ts',
    );
    expect(args('rust-analyzer.exe')).toBe('rust-analyzer.exe');
    expect(args('C:\\WINDOWS\\system32\\cmd.exe /d /s /c vite')).toBe('/d /s /c vite');
    expect(args('node --watch=src/a/b.ts http://localhost:5173/')).toBe(
      '--watch=src/a/b.ts http://localhost:5173/',
    );
    expect(args('node /usr/lib/x.js C:\\')).toBe('x.js C:\\');
    expect(
      args(
        '"C:\\Program Files\\nodejs\\node.exe" C:\\Users\\me\\AppData\\Roaming\\npm\\npx-cli.js -y rea-agents@6.5.0 mcp',
      ),
    ).toBe('npx-cli.js -y rea-agents@6.5.0 mcp');
  });
});

suite('process grouping', () => {
  it('puts only projectless orphans apart and groups the rest by project, heaviest first', () => {
    const rows = [
      row({ pid: 1, projectPath: 'P\\A', memory: 10 }),
      row({ pid: 2, projectPath: 'P\\B', memory: 50 }),
      row({ pid: 3, projectPath: 'P\\A', memory: 5, orphan: { reason: 'duplicate', of: 1 } }),
      row({ pid: 4, projectPath: null, session: 's', memory: 1 }),
      row({ pid: 5, memory: 2, orphan: { reason: 'no-project' } }),
    ];
    const { stray, groups } = groupProcesses(rows, ROOT, []);
    expect(stray.map((r) => r.pid)).toEqual([5]);
    expect(groups.map((g) => g.key)).toEqual(['P\\B', 'P\\A', null]);
    expect(groups[1]?.rows.map((r) => r.pid)).toEqual([1, 3]);
    expect(groups[1]?.memory).toBe(15);
  });

  it('gathers processes of a session under it, the root folder is its own group', () => {
    const rows = [
      row({ pid: 1, projectPath: 'C:\\P\\', session: 'aaaaaaaa-1', memory: 300 }),
      row({ pid: 2, projectPath: 'c:\\p', session: 'aaaaaaaa-1', memory: 100 }),
      row({ pid: 3, projectPath: 'C:\\P\\A', session: 'bbbbbbbb-2', memory: 10 }),
      row({ pid: 4, projectPath: 'C:\\P\\A', session: 'cccccccc-3', memory: 20 }),
      row({ pid: 5, projectPath: 'C:\\P\\A', memory: 1 }),
      row({
        pid: 6,
        projectPath: 'C:\\P\\A',
        session: 'dddddddd-4',
        memory: 1,
        orphan: { reason: 'session-closed' },
      }),
    ];
    const sessions = [
      {
        sessionId: 'aaaaaaaa-1',
        name: 'Корень',
        status: 'idle',
        since: null,
        phase: null,
        tool: null,
      },
      { sessionId: 'bbbbbbbb-2', name: null, status: 'waiting', since: 5, phase: null, tool: null },
    ] as const;
    const { groups } = groupProcesses(rows, ROOT, [...sessions]);
    const [rootGroup, a] = groups;
    expect(rootGroup?.key).toBe(ROOT);
    expect(rootGroup?.rows).toEqual([]);
    expect(rootGroup?.sessions.map((s) => [s.name, s.status, s.memory])).toEqual([
      ['Корень', 'idle', 400],
    ]);
    expect(a?.sessions.map((s) => [s.name, s.status])).toEqual([
      ['Claude bbbbbbbb', 'waiting'],
      ['Claude cccccccc', null],
    ]);
    expect(a?.rows.map((r) => r.pid)).toEqual([5, 6]);
    expect(groupName(ROOT, ROOT)).toBe('Projects (корень)');
    expect(groupName('C:\\P\\A', ROOT)).toBe('A');
  });

  it('collects hanging processes from every group, guarded ones stay out', () => {
    const rows = [
      row({ pid: 1, projectPath: 'C:\\P\\A', memory: 5, orphan: { reason: 'session-closed' } }),
      row({ pid: 2, memory: 9, orphan: { reason: 'no-project' } }),
      row({
        pid: 3,
        projectPath: 'C:\\P\\A',
        memory: 50,
        orphan: { reason: 'duplicate', of: 1 },
        guard: 'running-dev',
      }),
      row({ pid: 4, projectPath: 'C:\\P\\A', memory: 99 }),
    ];
    expect(orphans(rows).map((r) => r.pid)).toEqual([2, 1]);
  });

  it('shows a seen finished session as idle', () => {
    const rows = [row({ projectPath: 'C:\\P\\A', session: 's1' })];
    const done = {
      sessionId: 's1',
      name: 'x',
      status: 'done',
      since: 10,
      phase: null,
      tool: null,
    } as const;
    const { groups } = groupProcesses(rows, ROOT, [done], { s1: 20 });
    expect(groups[0]?.sessions[0]?.status).toBe('idle');
  });

  it('describes orphans by reason', () => {
    const now = 1_792_512_000_000;
    const closed = row({
      projectPath: 'C:\\P\\Tolk',
      orphan: { reason: 'session-closed', since: now - 2 * 3_600_000 },
    });
    expect(describe(closed, now)).toBe('Tolk · сессия закрыта 2 ч назад');
    expect(
      describe(row({ projectPath: 'C:\\P\\AM', orphan: { reason: 'duplicate', of: 2 } })),
    ).toBe('AM · второй экземпляр');
  });

  it('keeps only known projects in the usage table', () => {
    const u = (week: number): Usage => ({ week, today: 0, sessions: 1, days: {} });
    const top = topUsage(
      { 'P\\A': u(1), 'P\\B': u(9), 'C:\\tmp': u(99) },
      new Set(['P\\A', 'P\\B']),
    );
    expect(top.map(([k]) => k)).toEqual(['P\\B', 'P\\A']);
  });
});
