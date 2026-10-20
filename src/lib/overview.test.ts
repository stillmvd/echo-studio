import { expect, it, describe as suite } from 'vitest';
import {
  args,
  describe,
  gitText,
  groupProcesses,
  mb,
  mt,
  percent,
  resetText,
  topUsage,
} from './overview';
import type { ProcessRow, Usage } from './types';

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
  it('puts orphans apart and groups the rest by project, heaviest first', () => {
    const rows = [
      row({ pid: 1, projectPath: 'P\\A', memory: 10 }),
      row({ pid: 2, projectPath: 'P\\B', memory: 50 }),
      row({ pid: 3, projectPath: 'P\\A', memory: 5, orphan: { reason: 'duplicate', of: 1 } }),
      row({ pid: 4, projectPath: null, session: 's', memory: 1 }),
    ];
    const { stray, groups } = groupProcesses(rows);
    expect(stray.map((r) => r.pid)).toEqual([3]);
    expect(groups.map((g) => g.key)).toEqual(['P\\B', 'P\\A', null]);
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
