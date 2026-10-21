import { describe, expect, it } from 'vitest';
import type {
  ClaudeSession,
  DevServer,
  ProjectTree,
  SessionStatus,
  WorkbenchProject,
} from './types';
import {
  arrangeCells,
  arrangeWall,
  assignTabs,
  byRecency,
  byUrgency,
  effectiveStatus,
  emptyCells,
  HANDS_ON_MS,
  isPathTitle,
  type KeyInput,
  nextInRecency,
  normalizeCells,
  placeProject,
  projectOf,
  pruneCells,
  runningItems,
  samePath,
  terminalKey,
  topStatus,
  urgency,
  urgentTab,
  type WallCell,
  type WallTabs,
} from './workbench';

const key = (over: Partial<KeyInput>): KeyInput => ({
  type: 'keydown',
  key: '',
  code: '',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...over,
});

describe('isPathTitle', () => {
  it('drops paths and executables, keeps titles with slashes', () => {
    expect(isPathTitle('C:\\Users\\me\\.local\\bin\\claude.exe')).toBe(true);
    expect(isPathTitle('C:\\Program Files\\Git\\usr\\bin\\bash.exe')).toBe(true);
    expect(isPathTitle('claude.exe')).toBe(true);
    expect(isPathTitle('/usr/bin/bash')).toBe(true);
    expect(isPathTitle('\\\\server\\share')).toBe(true);
    expect(isPathTitle('Fix CI/CD pipeline')).toBe(false);
    expect(isPathTitle('Update src/lib')).toBe(false);
    expect(isPathTitle('Run setup.exe installer')).toBe(false);
    expect(isPathTitle('/review src/x.ts')).toBe(false);
    expect(isPathTitle('/add-dir foo/bar')).toBe(false);
    expect(isPathTitle('/compact')).toBe(false);
  });
});

describe('terminalKey', () => {
  it('sends ESC+CR for Shift+Enter and Alt+Enter', () => {
    expect(terminalKey(key({ key: 'Enter', shiftKey: true }), false)).toEqual({ send: '\x1b\r' });
    expect(terminalKey(key({ key: 'Enter', altKey: true }), false)).toEqual({ send: '\x1b\r' });
    expect(terminalKey(key({ key: 'Enter' }), false)).toBeNull();
  });

  it('sends ESC v for Alt+V in any layout', () => {
    expect(terminalKey(key({ key: 'м', code: 'KeyV', altKey: true }), false)).toEqual({
      send: '\x1bv',
    });
  });

  it('copies with Ctrl+C only when text is selected', () => {
    expect(terminalKey(key({ key: 'с', code: 'KeyC', ctrlKey: true }), true)).toEqual({
      copy: true,
    });
    expect(terminalKey(key({ key: 'c', code: 'KeyC', ctrlKey: true }), false)).toBeNull();
  });

  it('leaves Ctrl+V to the native paste and Ctrl+Tab to the switcher', () => {
    expect(terminalKey(key({ code: 'KeyV', ctrlKey: true }), false)).toEqual({ native: true });
    expect(terminalKey(key({ code: 'Tab', ctrlKey: true }), false)).toEqual({ pass: true });
    expect(terminalKey(key({ code: 'Tab', ctrlKey: true, shiftKey: true }), false)).toEqual({
      pass: true,
    });
  });

  it('ignores keyup', () => {
    expect(terminalKey(key({ type: 'keyup', key: 'Enter', shiftKey: true }), false)).toBeNull();
  });
});

const proj = (path: string): WorkbenchProject => ({
  path,
  name: path.split('\\').pop() ?? path,
  group: null,
  icon: null,
  dev: null,
  mcp: null,
  hasClaudeMd: false,
});

describe('projectOf', () => {
  const tree: ProjectTree = {
    root: 'C:\\P',
    roots: [proj('C:\\P\\Solo')],
    groups: [{ name: 'G', icon: null, projects: [proj('C:\\P\\G\\App'), proj('C:\\P\\G\\App2')] }],
  };

  it('matches by path prefix without case', () => {
    expect(projectOf(tree, 'c:/p/g/app/src')?.path).toBe('C:\\P\\G\\App');
    expect(projectOf(tree, 'C:\\P\\G\\App2')?.path).toBe('C:\\P\\G\\App2');
    expect(projectOf(tree, 'C:\\P\\G\\Ap')).toBeUndefined();
    expect(projectOf(tree, null)).toBeUndefined();
  });

  it('compares paths without case and trailing slash', () => {
    expect(samePath('C:\\P\\X\\', 'c:/p/x')).toBe(true);
  });
});

const session = (
  id: string,
  status: SessionStatus,
  since: number | null,
  projectPath: string | null = id,
): ClaudeSession => ({
  sessionId: id,
  shortId: null,
  kind: 'shell',
  projectPath,
  cwd: projectPath,
  name: null,
  status,
  phase: null,
  tool: null,
  since,
  pid: null,
  transcript: null,
  exitedAt: null,
});

const cell = (id: string, projectPath: string | null, over: Partial<WallCell> = {}): WallCell => ({
  id,
  projectPath,
  pinned: false,
  manual: false,
  lastInputAt: 0,
  ...over,
});

describe('urgency', () => {
  it('orders waiting, error, working, done, idle, exited', () => {
    const order: SessionStatus[] = ['exited', 'idle', 'done', 'working', 'error', 'waiting'];
    expect([...order].sort((a, b) => urgency(a) - urgency(b))).toEqual([
      'waiting',
      'error',
      'working',
      'done',
      'idle',
      'exited',
    ]);
  });

  it('sorts by urgency, then the longest waiting first', () => {
    const list = [
      session('a', 'working', 300),
      session('b', 'waiting', 500),
      session('c', 'waiting', 100),
      session('d', 'idle', 50),
    ];
    expect(byUrgency(list, {}).map((s) => s.sessionId)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('treats done as idle once seen after it finished', () => {
    const done = session('a', 'done', 1_000);
    expect(effectiveStatus(done, {})).toBe('done');
    expect(effectiveStatus(done, { a: 999 })).toBe('done');
    expect(effectiveStatus(done, { a: 1_000 })).toBe('idle');
    expect(effectiveStatus(session('b', 'waiting', 1_000), { b: 2_000 })).toBe('waiting');
  });

  it('mixes dev servers into the running list by urgency, hides stopped ones', () => {
    const dev = (projectPath: string, state: DevServer['state']): DevServer => ({
      projectPath,
      command: 'pnpm dev',
      state,
      ports: [],
      startedAt: 0,
      exitCode: null,
      log: '',
      pids: [],
    });
    const items = runningItems(
      [session('a', 'idle', 1), session('b', 'waiting', 2)],
      [dev('run', 'running'), dev('err', 'error'), dev('off', 'stopped')],
      {},
    );
    expect(
      items.map((i) => (i.kind === 'session' ? i.session.sessionId : i.server.projectPath)),
    ).toEqual(['b', 'err', 'a', 'run']);
  });

  it('gives the most urgent status of a project or group', () => {
    const group = [session('a', 'idle', 1), session('b', 'error', 5), session('c', 'working', 2)];
    expect(topStatus(group, {})).toBe('error');
    expect(topStatus([], {})).toBeNull();
  });
});

describe('arrangeCells', () => {
  const now = 100_000;
  const five = (e: SessionStatus) => [
    session('A', 'working', 100),
    session('B', 'working', 200),
    session('C', 'done', 300),
    session('D', 'idle', 400),
    session('E', e, 1_000),
  ];
  const wall = (over: Record<string, Partial<WallCell>> = {}) =>
    ['A', 'B', 'C', 'D'].map((p, i) => cell(`c${i}`, p, over[p]));
  const placed = (cells: WallCell[]) => cells.map((c) => c.projectPath);

  it('2x2 with five sessions: a new waiting one takes the lowest unlocked cell', () => {
    const r = arrangeCells(wall(), five('waiting'), now, null);
    expect(placed(r.cells)).toEqual(['A', 'B', 'C', 'E']);
    expect(r.offGrid).toEqual(['D']);
    expect(r.pendingCount).toBe(0);
  });

  it('an idle fifth session stays off the grid', () => {
    const r = arrangeCells(wall(), five('idle'), now, null);
    expect(placed(r.cells)).toEqual(['A', 'B', 'C', 'D']);
    expect(r.offGrid).toEqual(['E']);
  });

  it('does not move the cell under the hand: focus or recent input', () => {
    const focused = arrangeCells(wall(), five('waiting'), now, 'c3');
    expect(placed(focused.cells)).toEqual(['A', 'B', 'E', 'D']);
    expect(focused.offGrid).toEqual(['C']);
    const typing = arrangeCells(
      wall({ D: { lastInputAt: now - HANDS_ON_MS + 1 } }),
      five('waiting'),
      now,
      null,
    );
    expect(placed(typing.cells)).toEqual(['A', 'B', 'E', 'D']);
  });

  it('pinned and manually opened cells keep their project', () => {
    const r = arrangeCells(
      wall({ D: { pinned: true }, C: { manual: true } }),
      five('waiting'),
      now,
      null,
    );
    expect(placed(r.cells)).toEqual(['A', 'E', 'C', 'D']);
    expect(r.offGrid).toEqual(['B']);
  });

  it('counts waiting sessions left off the grid when every cell is locked', () => {
    const all = { pinned: true };
    const r = arrangeCells(wall({ A: all, B: all, C: all, D: all }), five('waiting'), now, null);
    expect(placed(r.cells)).toEqual(['A', 'B', 'C', 'D']);
    expect(r.offGrid).toEqual(['E']);
    expect(r.pendingCount).toBe(1);
  });

  it('fills empty cells by priority and keeps manual projects without sessions', () => {
    const cells = [cell('c0', 'Manual', { manual: true }), cell('c1', null), cell('c2', null)];
    const sessions = [
      session('X', 'idle', 1),
      session('Y', 'waiting', 5),
      session('Z', 'exited', 1),
    ];
    const r = arrangeCells(cells, sessions, now, null);
    expect(placed(r.cells)).toEqual(['Manual', 'Y', 'X']);
    expect(r.offGrid).toEqual([]);
    expect(r.moved).toEqual(['c1', 'c2']);
  });

  it('a project shown in two cells stays on the grid when one of them is taken', () => {
    const cells = [cell('c0', 'P'), cell('c1', 'P', { pinned: true })];
    const sessions = [session('P', 'idle', 1), session('Q', 'waiting', 5)];
    const r = arrangeCells(cells, sessions, now, null);
    expect(placed(r.cells)).toEqual(['Q', 'P']);
    expect(r.offGrid).toEqual([]);
    expect(r.pendingCount).toBe(0);
  });

  it('is idempotent on its own result', () => {
    const first = arrangeCells(wall(), five('waiting'), now, null);
    const second = arrangeCells(first.cells, five('waiting'), now, null);
    expect(placed(second.cells)).toEqual(placed(first.cells));
    expect(second.moved).toEqual([]);
    expect(second.offGrid).toEqual(first.offGrid);
  });

  it('does not displace on equal priority and orders ties deterministically', () => {
    const cells = [cell('c0', 'A')];
    const tie = [session('A', 'working', null), session('B', 'working', null)];
    const r = arrangeCells(cells, tie, now, null);
    expect(placed(r.cells)).toEqual(['A']);
    const flipped = arrangeCells([cell('c0', null)], [...tie].reverse(), now, null);
    expect(placed(flipped.cells)).toEqual(['A']);
    expect(flipped.offGrid).toEqual(['B']);
  });

  it('uses seen inside: a seen done project no longer outranks idle', () => {
    const cells = [cell('c0', 'D')];
    const sessions = [session('D', 'idle', 1), session('C', 'done', 10)];
    expect(placed(arrangeCells(cells, sessions, now, null).cells)).toEqual(['C']);
    expect(placed(arrangeCells(cells, sessions, now, null, { C: 20 }).cells)).toEqual(['D']);
  });

  it('unlocks a cell exactly HANDS_ON_MS after the last input', () => {
    const cells = [cell('c0', 'D', { lastInputAt: now - HANDS_ON_MS })];
    const sessions = [session('D', 'idle', 1), session('E', 'waiting', 5)];
    expect(placed(arrangeCells(cells, sessions, now, null).cells)).toEqual(['E']);
  });

  it('ranks a project by its most urgent session', () => {
    const cells = [cell('c0', 'B')];
    const sessions = [
      session('a1', 'idle', 1, 'A'),
      session('a2', 'error', 50, 'A'),
      session('b1', 'working', 1, 'B'),
    ];
    const r = arrangeCells(cells, sessions, now, null);
    expect(placed(r.cells)).toEqual(['A']);
    expect(r.offGrid).toEqual(['B']);
  });
});

describe('placeProject', () => {
  const cells = () => emptyCells();

  it('puts a manually opened project into the focused cell and marks it manual', () => {
    const r = placeProject(cells(), '2x2', 'c3', 'P');
    expect(r.focus).toBe('c3');
    expect(r.cells[2]).toMatchObject({ projectPath: 'P', manual: true });
  });

  it('focuses the cell that already shows the project', () => {
    const start = cells().map((c) => (c.id === 'c2' ? { ...c, projectPath: 'c:\\p\\' } : c));
    const r = placeProject(start, '2x2', 'c1', 'C:\\P');
    expect(r.focus).toBe('c2');
    expect(r.cells).toBe(start);
  });

  it('skips a pinned focus and cells beyond the layout', () => {
    const start = cells().map((c) =>
      c.id === 'c1' ? { ...c, projectPath: 'A', pinned: true } : { ...c, projectPath: c.id },
    );
    const r = placeProject(start, '2x1', 'c1', 'P');
    expect(r.focus).toBe('c2');
    expect(r.cells.map((c) => c.projectPath)).toEqual(['A', 'P', 'c3', 'c4']);
  });
});

describe('wall cells', () => {
  const at = (paths: (string | null)[]) =>
    emptyCells().map((c, i) => ({ ...c, projectPath: paths[i] ?? null }));

  it('moves a project from a hidden cell instead of showing it twice', () => {
    const start = at(['B', null, 'A', null]).map((c) =>
      c.id === 'c3' ? { ...c, activeTab: 't1', manual: true } : c,
    );
    const r = placeProject(start, '1x1', 'c1', 'A');
    expect(r.cells.map((c) => c.projectPath)).toEqual(['A', null, null, null]);
    expect(r.cells[0]?.activeTab).toBeUndefined();
    expect(r.cells[2]).toMatchObject({ manual: false, pinned: false });
  });

  it('normalizes broken persisted cells to four free ones', () => {
    expect(normalizeCells(undefined).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    const cells = normalizeCells([{ projectPath: 'A', pinned: true }, 7, null]);
    expect(cells[0]).toMatchObject({ id: 'c1', projectPath: 'A', pinned: true, manual: false });
    expect(cells.slice(1).every((c) => c.projectPath === null)).toBe(true);
  });

  it('frees cells of removed projects and keeps the array when nothing changes', () => {
    const start = at(['A', 'B', null, null]).map((c) => ({ ...c, pinned: true }));
    expect(pruneCells(start, () => true)).toBe(start);
    const r = pruneCells(start, (p) => p === 'A');
    expect(r[1]).toMatchObject({ projectPath: null, pinned: false });
    expect(r[0]?.projectPath).toBe('A');
  });

  it('gives two cells of one project different tabs', () => {
    const cells = at(['A', 'A', 'B', null]);
    const tabs: Record<string, string[]> = { A: ['a1', 'a2'], B: [] };
    const keys = assignTabs(
      cells,
      (p) => tabs[p] ?? [],
      () => 'a1',
    );
    expect(keys).toEqual(['a1', 'a2', null, null]);
  });

  it('leaves a cell without a key when every tab is already shown', () => {
    const cells = at(['A', 'A', null, null]).map((c) =>
      c.id === 'c1' ? { ...c, activeTab: 't1' } : c,
    );
    const keys = assignTabs(
      cells,
      () => ['t1'],
      () => 't1',
    );
    expect(keys).toEqual(['t1', null, null, null]);
  });

  it('lets an explicit cell tab win over an earlier cell without one', () => {
    const cells = at(['A', 'A', null, null]).map((c) =>
      c.id === 'c2' ? { ...c, activeTab: 'a1' } : c,
    );
    const keys = assignTabs(
      cells,
      () => ['a1', 'a2'],
      () => 'a1',
    );
    expect(keys).toEqual(['a2', 'a1', null, null]);
  });

  it('opens a tab automatically only for waiting or failed sessions', () => {
    expect(
      urgentTab([session('w', 'waiting', 1, 'A'), session('i', 'idle', 2, 'A')], 'A', {}),
    ).toBe('w');
    expect(urgentTab([session('e', 'error', 1, 'A')], 'a', {})).toBe('e');
    expect(urgentTab([session('d', 'done', 1, 'A'), session('i', 'idle', 2, 'A')], 'A', {})).toBe(
      null,
    );
    expect(urgentTab([session('r', 'working', 1, 'A')], 'A', {})).toBeNull();
  });
});

describe('arrangeWall', () => {
  const at = (paths: (string | null)[]) =>
    emptyCells().map((c, i) => ({ ...c, projectPath: paths[i] ?? null }));
  const noTabs: WallTabs = { tabsOf: () => [], activeOf: () => undefined };
  const tabsFrom = (tabs: Record<string, string[]>): WallTabs => ({
    tabsOf: (p) => tabs[p] ?? [],
    activeOf: (p) => tabs[p]?.[0],
  });

  it('frees an automatic hidden cell when its project is shown again after shrinking', () => {
    const start = at([null, null, 'X', null]);
    const r = arrangeWall(start, 2, [session('x', 'working', 1, 'X')], 10_000, null, {}, noTabs);
    expect(r.cells.map((c) => c.projectPath)).toEqual(['X', null, null, null]);
  });

  it('keeps a pinned hidden cell and its pin through shrinking and growing back', () => {
    const start = at([null, null, 'X', null]).map((c) =>
      c.id === 'c3' ? { ...c, pinned: true } : c,
    );
    const sessions = [session('x', 'working', 1, 'X')];
    const r = arrangeWall(start, 1, sessions, 10_000, null, {}, noTabs);
    expect(r.cells.map((c) => c.projectPath)).toEqual(['X', null, 'X', null]);
    expect(r.cells[2]?.pinned).toBe(true);
    const back = arrangeWall(r.cells, 4, sessions, 10_000, null, {}, noTabs);
    expect(back.cells.map((c) => c.projectPath)).toEqual([null, null, 'X', null]);
    expect(back.cells[2]?.pinned).toBe(true);
  });

  it('keeps an automatic twin in the focused or freshly typed cell', () => {
    const start = at(['X', 'X', null, null]);
    const sessions = [session('x', 'idle', 1, 'X')];
    const tabs = tabsFrom({ X: ['x'] });
    const focused = arrangeWall(start, 4, sessions, 10_000, 'c2', {}, tabs);
    expect(focused.cells.map((c) => c.projectPath)).toEqual(['X', 'X', null, null]);
    const typed = start.map((c) => (c.id === 'c2' ? { ...c, lastInputAt: 9_000 } : c));
    const fresh = arrangeWall(typed, 4, sessions, 10_000, null, {}, tabs);
    expect(fresh.cells.map((c) => c.projectPath)).toEqual(['X', 'X', null, null]);
    const stale = arrangeWall(start, 4, sessions, 10_000, null, {}, tabs);
    expect(stale.cells.map((c) => c.projectPath)).toEqual(['X', null, null, null]);
  });

  it('drops an automatic twin without its own tab and keeps the pinned one', () => {
    const start = at([null, 'X', 'X', null]).map((c) =>
      c.id === 'c3' ? { ...c, pinned: true } : c,
    );
    const r = arrangeWall(
      start,
      4,
      [session('x', 'idle', 1, 'X')],
      10_000,
      null,
      {},
      tabsFrom({ X: ['x'] }),
    );
    expect(r.cells.map((c) => c.projectPath)).toEqual([null, null, 'X', null]);
  });

  it('gives a waiting session of a project already on the grid its own free cell', () => {
    const start = at(['E', null, null, null]).map((c) =>
      c.id === 'c1' ? { ...c, manual: true } : c,
    );
    const sessions = [session('e1', 'working', 1, 'E'), session('e2', 'waiting', 2, 'E')];
    const tabs = tabsFrom({ E: ['e1'] });
    const r = arrangeWall(start, 4, sessions, 10_000, 'c1', {}, tabs);
    expect(r.cells[1]).toMatchObject({ projectPath: 'E', activeTab: 'e2' });
    expect(r.moved).toEqual(['c2']);
    expect(r.pendingCount).toBe(0);
    expect(r.offGrid).toEqual([]);
  });

  it('counts waiting sessions without a cell when every cell is held', () => {
    const start = at(['E', 'F', null, null]).map((c) => ({ ...c, pinned: c.projectPath !== null }));
    const sessions = [
      session('e1', 'working', 1, 'E'),
      session('e2', 'waiting', 2, 'E'),
      session('f1', 'idle', 3, 'F'),
    ];
    const r = arrangeWall(start, 2, sessions, 10_000, null, {}, tabsFrom({ E: ['e1'], F: ['f1'] }));
    expect(r.offGrid).toEqual(['e2']);
    expect(r.pendingCount).toBe(1);
  });
});

describe('Ctrl+Tab order', () => {
  it('puts recently focused sessions first, the rest by urgency', () => {
    const sessions = [
      session('A', 'idle', 1),
      session('B', 'waiting', 2),
      session('C', 'working', 3),
      session('D', 'error', 4),
    ];
    const ids = byRecency(sessions, ['C', 'X', 'A'], {}).map((s) => s.sessionId);
    expect(ids).toEqual(['C', 'A', 'B', 'D']);
  });

  it('steps forward and back with wrap-around', () => {
    const order = ['C', 'A', 'B'];
    expect(nextInRecency(order, 'C')).toBe('A');
    expect(nextInRecency(order, 'B')).toBe('C');
    expect(nextInRecency(order, 'C', true)).toBe('B');
    expect(nextInRecency(order, 'A', true)).toBe('C');
  });

  it('handles empty, single and unknown current', () => {
    expect(nextInRecency([], 'A')).toBeNull();
    expect(nextInRecency(['A'], 'A')).toBe('A');
    expect(nextInRecency(['A', 'B'], null)).toBe('B');
    expect(nextInRecency(['A', 'B'], 'gone')).toBe('B');
  });
});
