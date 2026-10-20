import { describe, expect, it } from 'vitest';
import type { ClaudeSession, ProjectTree, SessionStatus, WorkbenchProject } from './types';
import {
  arrangeCells,
  byUrgency,
  effectiveStatus,
  HANDS_ON_MS,
  type KeyInput,
  projectOf,
  samePath,
  terminalKey,
  topStatus,
  urgency,
  type WallCell,
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
  });
});
