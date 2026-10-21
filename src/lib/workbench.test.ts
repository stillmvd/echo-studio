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
  byUrgency,
  cellOfTab,
  detectAgentView,
  effectiveStatus,
  emptyCells,
  emptyLayout,
  externalAction,
  HANDS_ON_MS,
  isPathTitle,
  type KeyInput,
  moveTabInLayout,
  nextInRecency,
  normalizeCells,
  normalizeLayout,
  placeProject,
  projectOf,
  pruneCells,
  type RunningItem,
  recentSessions,
  runningGroups,
  STATUS_HINT,
  STATUS_LABEL,
  samePath,
  statusTitle,
  statusView,
  terminalKey,
  topStatus,
  URGENCY,
  urgency,
  urgentTab,
  type WallCell,
  type WallTabs,
  wallPick,
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
  const top = (i: RunningItem) => (i.kind === 'session' ? i.session.sessionId : i.server.state);

  it('groups the running list by project, the most urgent group first', () => {
    const groups = runningGroups(
      [
        session('a1', 'idle', 1, 'A'),
        session('b1', 'working', 3, 'B'),
        session('a2', 'waiting', 2, 'A'),
        session('r', 'working', 1, null),
      ],
      [dev('C', 'error'), dev('B', 'running'), dev('D', 'stopped')],
      {},
    );
    expect(groups.map((g) => g.path)).toEqual(['A', 'C', 'B', null]);
    expect(groups.map((g) => top(g.top))).toEqual(['a2', 'error', 'b1', 'r']);
    expect(groups[0]?.sessions.map((s) => s.sessionId)).toEqual(['a2', 'a1']);
    expect(groups[2]?.devs.map((d) => d.state)).toEqual(['running']);
  });

  it('matches project paths without case, puts the Projects group last on a tie', () => {
    const groups = runningGroups(
      [session('r', 'working', 1, null), session('x', 'working', 2, 'C:\\P\\X')],
      [dev('c:/p/x', 'running')],
      {},
    );
    expect(groups.map((g) => g.path)).toEqual(['C:\\P\\X', null]);
    expect(groups[0]?.devs).toHaveLength(1);
  });

  it('puts groups with only exited sessions last', () => {
    const ext: ClaudeSession = { ...session('x', 'exited', 1), kind: 'external', exitedAt: 1 };
    const groups = runningGroups([ext, session('a', 'idle', 5)], [], {});
    expect(groups.map((g) => g.path)).toEqual(['a', 'x']);
  });

  it('shows a fresh session without a title as new, a resumed or seen one as waiting for a task', () => {
    const fresh = session('a', 'idle', null);
    expect(statusView(fresh, {})).toBe('new');
    expect(statusView({ ...fresh, name: 'fix login' }, {})).toBe('idle');
    expect(statusView(session('b', 'done', 1_000), { b: 2_000 })).toBe('idle');
    expect(statusView(session('c', 'done', 1_000), {})).toBe('done');
    expect(STATUS_LABEL[statusView(fresh, {})]).toBe('новая · ждёт задачу');
    expect(STATUS_LABEL.idle).toBe('ждёт задачу');
    expect(STATUS_LABEL.done).toBe('ответ готов');
    expect(urgency('new')).toBe(urgency('idle'));
  });

  it('gives every status a label and a hint, external sessions say so', () => {
    for (const status of [...URGENCY, 'new'] as const) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(STATUS_HINT[status]).toBeTruthy();
    }
    expect(statusTitle('working')).toBe('работает — Claude отвечает');
    expect(statusTitle('waiting', true)).toContain('Открыта в терминале вне Echo');
  });

  it('gives the most urgent status of a project or group', () => {
    const group = [session('a', 'idle', 1), session('b', 'error', 5), session('c', 'working', 2)];
    expect(topStatus(group, {})).toBe('error');
    expect(topStatus([], {})).toBeNull();
  });
});

describe('detectAgentView', () => {
  const rule = '─'.repeat(60);
  const agentView = [
    ' ▐▛███▜▌   Claude Code v2.1.306',
    '▝▜█████▛▘  New sessions: Opus 5.5 · high effort',
    '  ▘▘ ▝▝    ~\\Projects\\Windows Apps\\Echo Studio',
    '',
    '           5 awaiting input · 3 working · 17 completed',
    'Needs input',
    ' ✻ current session                           v2-front-sessions                 8m',
    'Working',
    ' ✻ v2-rust                                   Running cat "C:/Users/…"         34m',
    'Completed',
    ' ∙ v2-front-controls                         Правка по ревью…                 25m',
    rule,
    '❯ describe a task for a new session',
    rule,
    '  enter to return · space to reply · ctrl+x to delete · ? for shortcuts',
  ];
  const trust = [
    rule,
    '',
    ' Accessing workspace:',
    '',
    ' C:\\Users\\stillmvd',
    '',
    ' Quick safety check: Is this a project you created or one you trust?',
  ];
  const session = [
    ' ▐▛███▜▌   Claude Code v2.1.306',
    '▝▜█████▛▘  Opus 5.5 with high effort · Claude Max',
    '  ▘▘ ▝▝    ~\\Projects\\Windows Apps\\Echo Studio\\.claude\\worktrees\\v2-front-sessions',
    rule,
    '❯ ',
    rule,
    '  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← 2 agents',
  ];
  const slashMenu = [
    '❯ /exit',
    rule,
    '  /exit            Detach from this background session (it keeps running)',
    '  /phase:next      Взять следующую неначатую фазу задачи и выполнить её',
    '  /besit           Записать, что бесит в моих десктоп-приложениях',
  ];
  const quoted = [
    '⏺ Agent view shows a field that says "describe a task for a new session" and a hint',
    '  line: enter to return · space to reply · ctrl+x to delete.',
    '  New sessions: Opus 5.5 · high effort is the header there.',
  ];

  it('sees agent view after /exit and the double left arrow', () => {
    expect(detectAgentView(agentView)).toBe(true);
    expect(detectAgentView(agentView.slice(-4))).toBe(true);
  });

  it('sees the trust prompt agent view opens in an untrusted home folder', () => {
    expect(detectAgentView(trust)).toBe(true);
  });

  it('sees agent view and the trust prompt wrapped in a narrow cell', () => {
    const narrowTrust = [
      ' Accessing workspace:',
      '',
      ' C:\\Users\\stillmvd',
      '',
      ' Quick safety check: Is this a',
      ' project you created or one you',
      ' trust?',
    ];
    const narrowView = [
      '❯ describe a task for a',
      '  new session',
      '  enter to return · space to',
      '  reply · ctrl+x to delete',
    ];
    expect(detectAgentView(narrowTrust)).toBe(true);
    expect(detectAgentView(narrowView)).toBe(true);
  });

  it('leaves the session screen, its slash menu and quoted marker text alone', () => {
    expect(detectAgentView(session)).toBe(false);
    expect(detectAgentView(slashMenu)).toBe(false);
    expect(detectAgentView([...session.slice(0, 3), ...slashMenu])).toBe(false);
    expect(detectAgentView(quoted)).toBe(false);
    expect(detectAgentView([])).toBe(false);
  });
});

describe('externalAction', () => {
  const ext = (status: SessionStatus, projectPath: string | null): ClaudeSession => ({
    ...session('e', status, 1, projectPath),
    kind: 'external',
    pid: status === 'exited' ? null : 42,
  });

  it('focuses a live external session wherever it runs', () => {
    expect(externalAction(ext('working', 'C:\\P\\Tolk'))).toBe('focus');
    expect(externalAction(ext('waiting', null))).toBe('focus');
  });

  it('offers to resume an exited one only inside a known project', () => {
    expect(externalAction(ext('exited', 'C:\\P\\Tolk'))).toBe('resume');
    expect(externalAction(ext('exited', null))).toBe('none');
  });

  it('leaves shell sessions to the shell', () => {
    expect(externalAction(session('s', 'working', 1))).toBe('none');
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
    expect(r.cells[1]).toMatchObject({ projectPath: 'c:\\p\\', manual: true });
    const held = start.map((c) => (c.id === 'c2' ? { ...c, pinned: true } : c));
    expect(placeProject(held, '2x2', 'c1', 'C:\\P').cells).toBe(held);
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

  it('restored cells forget their tab and manual mark unless pinned', () => {
    const cells = normalizeCells([
      { projectPath: 'B', manual: true, activeTab: 'b-old' },
      { projectPath: 'S', activeTab: 'dev:S' },
      { projectPath: 'P', pinned: true, activeTab: 'p1' },
    ]);
    expect(cells[0]).toMatchObject({ projectPath: 'B', manual: false, activeTab: undefined });
    expect(cells[1]).toMatchObject({ projectPath: 'S', activeTab: undefined });
    expect(cells[2]).toMatchObject({ pinned: true, activeTab: 'p1' });
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

  it('places only waiting, working and failed sessions by itself', () => {
    const sessions = [
      session('d', 'done', 1, 'D'),
      session('i', 'idle', 2, 'I'),
      session('x', 'exited', 3, 'X'),
      session('w', 'working', 4, 'W'),
    ];
    const r = arrangeWall(at([null, null, null, null]), 4, sessions, 10_000, null, {}, noTabs);
    expect(r.cells.map((c) => c.projectPath)).toEqual(['W', null, null, null]);
    expect(r.cells[0]?.activeTab).toBe('w');
  });

  it('an automatic cell shows the live session, never the dev log or an ended tab', () => {
    const dev = 'dev:S';
    const tabs: WallTabs = {
      tabsOf: () => [dev, 'old', 'w'],
      activeOf: () => dev,
    };
    const sessions = [session('w', 'working', 1, 'S')];
    const r = arrangeWall(at([null, null, null, null]), 4, sessions, 10_000, null, {}, tabs);
    expect(r.cells[0]).toMatchObject({ projectPath: 'S', activeTab: 'w' });
    const keys = assignTabs(
      at(['S', null, null, null]),
      tabs.tabsOf,
      tabs.activeOf,
      wallPick(sessions, {}, tabs.activeOf),
    );
    expect(keys[0]).toBe('w');
  });

  it('frees an automatic cell whose session ended or that has nothing live to show', () => {
    const ended = at(['B', 'S', null, null]).map((c) =>
      c.id === 'c1' ? { ...c, activeTab: 'b-old' } : c,
    );
    const tabs = tabsFrom({ B: ['b-old'], S: ['dev:S'] });
    const r = arrangeWall(ended, 4, [], 10_000, null, {}, tabs);
    expect(r.cells.map((c) => c.projectPath)).toEqual([null, null, null, null]);
  });

  it('frees nothing until the session list has answered', () => {
    const start = at(['B', null, null, null]).map((c) =>
      c.id === 'c1' ? { ...c, activeTab: 'b-old' } : c,
    );
    const r = arrangeWall(
      start,
      4,
      [],
      10_000,
      null,
      {},
      {
        ...tabsFrom({ B: ['b-old'] }),
        ready: false,
      },
    );
    expect(r.changed).toBe(false);
    expect(r.cells).toBe(start);
  });

  it('keeps an ended automatic cell under the hands for a moment, then frees it', () => {
    const start = at(['B', null, null, null]).map((c) =>
      c.id === 'c1' ? { ...c, activeTab: 'b-old', lastInputAt: 9_000 } : c,
    );
    const tabs = tabsFrom({ B: ['b-old'] });
    expect(arrangeWall(start, 4, [], 10_000, null, {}, tabs).cells[0]?.projectPath).toBe('B');
    expect(
      arrangeWall(start, 4, [], 9_000 + HANDS_ON_MS, null, {}, tabs).cells[0]?.projectPath,
    ).toBeNull();
  });

  it('keeps an empty focused automatic cell and an ended tab the user chose', () => {
    const start = at(['B', 'C', null, null]).map((c) =>
      c.id === 'c2' ? { ...c, manual: true, activeTab: 'c-old' } : c,
    );
    const r = arrangeWall(start, 4, [], 10_000, 'c1', {}, tabsFrom({ C: ['c-old'] }));
    expect(r.cells.map((c) => c.projectPath)).toEqual(['B', 'C', null, null]);
    expect(r.cells[1]?.activeTab).toBe('c-old');
  });

  it('hands the session of an automatic twin to the held cell of the project', () => {
    const start = at(['X', 'X', null, null]).map((c) =>
      c.id === 'c1' ? { ...c, manual: true } : { ...c, activeTab: c.projectPath ? 'x' : undefined },
    );
    const sessions = [session('x', 'working', 1, 'X')];
    const r = arrangeWall(start, 4, sessions, 10_000, null, {}, tabsFrom({ X: ['x'] }));
    expect(r.cells[0]).toMatchObject({ projectPath: 'X', manual: true, activeTab: 'x' });
    expect(r.cells[1]?.projectPath).toBeNull();
  });

  it('external waiting sessions are not counted as pending for the wall', () => {
    const ext = { ...session('e', 'waiting', 1, 'E'), kind: 'external' as const };
    const r = arrangeWall(at([null, null, null, null]), 4, [ext], 10_000, null, {}, noTabs);
    expect(r.pendingCount).toBe(0);
    expect(r.cells.every((c) => c.projectPath === null)).toBe(true);
  });

  it('keeps a dev log the user opened in a cell and a session that just started', () => {
    const start = at(['S', 'N', null, null]).map((c) =>
      c.id === 'c1' ? { ...c, activeTab: 'dev:S' } : { ...c, activeTab: 'new' },
    );
    const tabs: WallTabs = {
      ...tabsFrom({ S: ['dev:S'], N: ['new'] }),
      isFresh: (key) => key === 'new',
    };
    const r = arrangeWall(start, 4, [], 10_000, null, {}, tabs);
    expect(r.cells.map((c) => c.projectPath)).toEqual(['S', 'N', null, null]);
  });

  it('a held cell without live sessions keeps its project but shows no ended tab', () => {
    const start = at(['B', null, null, null]).map((c) => ({
      ...c,
      manual: c.projectPath !== null,
    }));
    const tabs = tabsFrom({ B: ['dev:B', 'b-old'] });
    const sessions = [session('b-old', 'exited', 1, 'B')];
    const r = arrangeWall(start, 4, sessions, 10_000, null, {}, tabs);
    expect(r.cells[0]?.projectPath).toBe('B');
    const keys = assignTabs(
      r.cells,
      tabs.tabsOf,
      tabs.activeOf,
      wallPick(sessions, {}, tabs.activeOf),
    );
    expect(keys[0]).toBeNull();
  });
});

describe('Ctrl+Tab order', () => {
  it('walks the history of opened sessions, drops exited and removed ones', () => {
    const sessions = [
      session('A', 'idle', 1),
      session('B', 'waiting', 2),
      session('C', 'working', 3),
      session('E', 'exited', 4),
    ];
    const ids = recentSessions(['C', 'X', 'E', 'A'], sessions).map((s) => s.sessionId);
    expect(ids).toEqual(['C', 'A']);
  });

  it('keeps at most six recent sessions', () => {
    const ids = ['1', '2', '3', '4', '5', '6', '7'];
    const sessions = ids.map((id) => session(id, 'working', 1));
    expect(recentSessions(ids, sessions).map((s) => s.sessionId)).toEqual(ids.slice(0, 6));
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

describe('project layout', () => {
  const cell = (tabs: string[], active?: string) => (active ? { tabs, active } : { tabs });

  it('starts empty with one visible cell', () => {
    expect(normalizeLayout(undefined, [])).toEqual(emptyLayout());
    expect(normalizeLayout('junk', ['a']).cells[0]).toEqual(cell(['a'], 'a'));
  });

  it('keeps every open tab in exactly one cell and drops closed ones', () => {
    const l = normalizeLayout(
      {
        layout: '2x1',
        focus: 1,
        cells: [cell(['a', 'gone', 'b'], 'gone'), cell(['b', 'c'], 'c'), cell([]), cell([])],
      },
      ['a', 'b', 'c', 'd'],
    );
    expect(l.cells.map((c) => c.tabs)).toEqual([['a', 'b'], ['c', 'd'], [], []]);
    expect(l.cells[0]?.active).toBe('b');
    expect(l.cells[1]?.active).toBe('c');
    expect(l.cells[2]?.active).toBeUndefined();
  });

  it('moves tabs of hidden cells into the last visible one', () => {
    const l = normalizeLayout(
      {
        layout: '2x1',
        focus: 3,
        cells: [cell(['a']), cell(['b'], 'b'), cell(['c']), cell(['d'])],
      },
      ['a', 'b', 'c', 'd'],
    );
    expect(l.focus).toBe(1);
    expect(l.cells.map((c) => c.tabs)).toEqual([['a'], ['b', 'c', 'd'], [], []]);
    expect(l.cells[1]?.active).toBe('b');
  });

  it('moves a tab between cells and inside a cell', () => {
    const base = normalizeLayout(
      { layout: '2x1', focus: 0, cells: [cell(['claude', 'dev'], 'claude')] },
      ['claude', 'dev'],
    );
    const right = moveTabInLayout(base, 'dev', 1);
    expect(right.cells.map((c) => c.tabs)).toEqual([['claude'], ['dev'], [], []]);
    expect(right.cells[1]?.active).toBe('dev');
    expect(right.focus).toBe(1);
    expect(cellOfTab(right, 'dev')).toBe(1);

    const back = moveTabInLayout(right, 'dev', 0, 0);
    expect(back.cells[0]).toEqual(cell(['dev', 'claude'], 'dev'));
    expect(back.cells[1]).toEqual(cell([]));

    const after = moveTabInLayout(back, 'dev', 0, 2);
    expect(after.cells[0]?.tabs).toEqual(['claude', 'dev']);
    expect(moveTabInLayout(after, 'dev', 0, 1).cells[0]?.tabs).toEqual(['claude', 'dev']);
  });

  it('ignores unknown tabs and clamps the target cell to the layout', () => {
    const l = normalizeLayout({ layout: '1x1' }, ['a']);
    expect(moveTabInLayout(l, 'nope', 0)).toBe(l);
    expect(cellOfTab(moveTabInLayout(l, 'a', 3), 'a')).toBe(0);
  });
});
