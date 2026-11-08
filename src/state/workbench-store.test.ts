import { beforeEach, describe, expect, it } from 'vitest';
import { emptyCells } from '@/lib/workbench';
import {
  currentKey,
  devTabKey,
  isDevTab,
  migrateWorkbench,
  useWorkbenchStore,
} from './workbench-store';

const P = 'C:\\P\\A';
const B = 'C:\\P\\B';

const st = () => useWorkbenchStore.getState();
const panes = (path: string) => st().grids[path]?.panes.map((p) => p.tabs);

describe('workbench store', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      grids: {},
      tabs: {},
      activeTab: {},
      recency: [],
      view: { kind: 'overview' },
      auto: false,
      layout: '1x1',
      cells: emptyCells(),
      focusCell: 'c1',
      autoTabs: [],
      seen: {},
      hiddenProjects: [],
    });
  });

  it('opens tabs into the focused pane and derives the project tab list', () => {
    st().openTab(P, 'a');
    st().openTab(P, 'b');
    st().openTab(P, 'a');
    expect(panes(P)).toEqual([['a', 'b']]);
    expect(st().tabs[P]).toEqual(['a', 'b']);
    expect(st().activeTab[P]).toBe('a');
    expect(st().recency).toEqual(['a', 'b']);
  });

  it('puts a session of any project into a wall cell and keeps the wall on', () => {
    useWorkbenchStore.setState({ auto: true, autoTabs: ['s2'] });
    st().openTab(P, 's1');
    st().moveTabToWallCell('c1', P, 's1');
    st().moveTabToWallCell('c2', B, 's2');
    const [c1, c2] = st().cells;
    expect(c1).toMatchObject({ projectPath: P, activeTab: 's1', manual: true });
    expect(c2).toMatchObject({ projectPath: B, activeTab: 's2', manual: true });
    expect(st().tabs[B]).toEqual(['s2']);
    expect(st().autoTabs).toEqual([]);
    expect(st().focusCell).toBe('c2');
    expect(st().auto).toBe(true);
  });

  it('closing the active tab activates the last remaining tab of its pane', () => {
    for (const k of ['a', 'b', 'c']) st().openTab(P, k);
    st().activate(P, 'a');
    st().closeTab(P, 'a');
    expect(st().activeTab[P]).toBe('c');
    st().closeTab(P, 'c');
    st().closeTab(P, 'b');
    expect(st().activeTab[P]).toBeUndefined();
    expect(st().tabs[P]).toEqual([]);
  });

  it('renames a tab in place after /new, keeping order and activity', () => {
    for (const k of ['a', 'old', 'b']) st().openTab(P, k);
    st().activate(P, 'old');
    st().renameTab(P, 'old', 'new');
    expect(panes(P)).toEqual([['a', 'new', 'b']]);
    expect(st().activeTab[P]).toBe('new');
    expect(st().recency[0]).toBe('new');
    const before = st().grids;
    st().renameTab(P, 'a', 'b');
    expect(st().grids).toBe(before);
  });

  it('keeps one layout per project: a split in A does not split B', () => {
    st().openTab(P, 'a');
    st().openTab(P, 'b');
    st().splitTab(P, 'b', 0, 'right');
    st().openTab(B, 'x');
    expect(st().grids[P]?.layout).toBe('2x1');
    expect(panes(P)).toEqual([['a'], ['b']]);
    expect(st().grids[B]?.layout).toBe('1x1');
    expect(panes(B)).toEqual([['x']]);
  });

  it('never shows one tab in two panes', () => {
    st().openTab(P, 'a');
    st().openTab(P, 'b');
    st().splitTab(P, 'b', 0, 'right');
    st().focusPane(P, 0);
    st().openTab(P, 'b');
    expect(panes(P)).toEqual([['a'], ['b']]);
    expect(st().grids[P]?.focus).toBe(1);
  });

  it('a new session and dev go into the focused pane', () => {
    st().openTab(P, 'a');
    st().setGridLayout(P, '2x1');
    st().focusPane(P, 1);
    st().openTab(P, devTabKey(P));
    st().openTab(P, 's2');
    expect(panes(P)).toEqual([['a'], [devTabKey(P), 's2']]);
    expect(st().activeTab[P]).toBe('s2');
  });

  it('moves tabs between panes and leaves an emptied pane in place', () => {
    st().openTab(P, 'a');
    st().openTab(P, 'b');
    st().splitTab(P, 'b', 0, 'right');
    st().moveTab(P, 'a', 1, 0);
    expect(panes(P)).toEqual([[], ['a', 'b']]);
    expect(st().grids[P]?.layout).toBe('2x1');
    expect(st().grids[P]?.panes[1]?.active).toBe('a');
  });

  it('shrinking a layout merges the hidden panes into the visible ones', () => {
    for (const k of ['a', 'b', 'c']) st().openTab(P, k);
    st().splitTab(P, 'c', 0, 'right');
    st().splitTab(P, 'b', 0, 'bottom');
    expect(panes(P)).toEqual([['a'], ['c'], ['b'], []]);
    st().setGridLayout(P, '1x1');
    expect(panes(P)).toEqual([['a', 'c', 'b']]);
  });

  it('adopts tabs without stealing the active one', () => {
    st().openTab(P, 'a');
    st().adoptTabs([
      { path: P, key: 'z' },
      { path: B, key: 'y' },
    ]);
    expect(panes(P)).toEqual([['a', 'z']]);
    expect(st().activeTab[P]).toBe('a');
    expect(st().activeTab[B]).toBe('y');
    expect(st().autoTabs).toEqual(['z', 'y']);
    st().activate(P, 'z');
    expect(st().autoTabs).toEqual(['y']);
  });

  it('selecting a project leaves the Pult, the Pult switch keeps the project', () => {
    st().setAuto(true);
    st().select({ kind: 'project', path: P });
    expect(st().auto).toBe(false);
    st().setAuto(true);
    expect(st().view).toEqual({ kind: 'project', path: P });
  });

  it('focusing a pane marks its session as seen', () => {
    st().openTab(P, 's');
    st().openTab(P, 't');
    st().splitTab(P, 't', 0, 'right');
    st().focusPane(P, 0, 's');
    expect(st().seen.s).toBeGreaterThan(0);
    expect(currentKey(st())).toBeUndefined();
    st().select({ kind: 'project', path: P });
    expect(currentKey(st())).toBe('s');
  });

  it('marks dev tabs', () => {
    expect(isDevTab(devTabKey(P))).toBe(true);
    expect(isDevTab('abc')).toBe(false);
  });

  it('hides and unhides projects by path', () => {
    st().hideProject(P);
    st().hideProject('c:\\p\\a');
    expect(st().hiddenProjects).toEqual([P]);
    st().unhideProject('c:\\p\\a');
    expect(st().hiddenProjects).toEqual([]);
  });

  it('Pult cells activate only tabs of their project', () => {
    st().openTab(P, 'a');
    st().openTab(B, 'x');
    useWorkbenchStore.setState({
      cells: emptyCells().map((c) => (c.id === 'c1' ? { ...c, projectPath: B } : c)),
    });
    st().activateCell('c1', 'a');
    expect(st().cells[0]?.activeTab).toBeUndefined();
    st().activateCell('c1', 'x');
    expect(st().cells[0]?.activeTab).toBe('x');
  });

  it('keeps the focused Pult cell visible when the layout shrinks', () => {
    useWorkbenchStore.setState({
      layout: '2x2',
      cells: emptyCells().map((c, i) => ({ ...c, projectPath: ['A', 'B', 'C', 'D'][i] ?? null })),
      focusCell: 'c3',
    });
    st().setLayout('1x1');
    expect(st().cells[0]?.projectPath).toBe('C');
    expect(st().focusCell).toBe('c1');
  });
});

describe('migrateWorkbench', () => {
  it('normalizes garbage into an empty overview', () => {
    const s = migrateWorkbench({ layout: 'nope', view: { kind: 'x' }, cells: 5 });
    expect(s.layout).toBe('1x1');
    expect(s.view).toEqual({ kind: 'overview' });
    expect(s.grids).toEqual({});
    expect(s.auto).toBe(false);
  });

  it('turns v4 project tabs into one pane per project', () => {
    const s = migrateWorkbench({
      auto: false,
      tabs: { [P]: ['a', 'b'], [B]: ['x'] },
      activeTab: { [P]: 'a' },
      layout: '1x1',
      cells: [{ projectPath: P, manual: true, activeTab: 'a' }],
      view: { kind: 'project', path: P },
    });
    expect(s.grids?.[P]).toEqual({
      layout: '1x1',
      panes: [{ tabs: ['a', 'b'], active: 'a' }],
      focus: 0,
    });
    expect(s.grids?.[B]?.panes[0]).toEqual({ tabs: ['x'], active: 'x' });
    expect(s.tabs?.[P]).toEqual(['a', 'b']);
    expect(s.activeTab?.[P]).toBe('a');
  });

  it('keeps a v4 split of one project as two panes', () => {
    const s = migrateWorkbench({
      auto: false,
      tabs: { [P]: ['a', 'b', 'c'] },
      activeTab: { [P]: 'b' },
      layout: '2x1',
      cells: [
        { projectPath: P, manual: true, activeTab: 'a' },
        { projectPath: P, manual: true, activeTab: 'b' },
        { projectPath: B, pinned: true, activeTab: 'z' },
      ],
    });
    expect(s.grids?.[P]?.layout).toBe('2x1');
    expect(s.grids?.[P]?.panes.map((p) => p.tabs)).toEqual([['a', 'c'], ['b']]);
    expect(s.cells?.[0]).toMatchObject({ manual: false, activeTab: undefined });
    expect(s.cells?.[2]).toMatchObject({ pinned: true, activeTab: 'z' });
  });

  it('turns v3 project layouts into grids', () => {
    const s = migrateWorkbench({
      mode: 'project',
      tabs: { [P]: ['a', 'b', 'gone-not'] },
      projectLayouts: {
        [P]: { layout: '2x1', cells: [{ tabs: ['a'], active: 'a' }, { tabs: ['b', 'ghost'] }] },
      },
      view: { kind: 'project', path: P },
    });
    expect(s.auto).toBe(false);
    expect(s.grids?.[P]?.layout).toBe('2x1');
    expect(s.grids?.[P]?.panes.map((p) => p.tabs)).toEqual([['a', 'gone-not'], ['b']]);
  });

  it('a v3 wall mode becomes the Pult', () => {
    expect(migrateWorkbench({ mode: 'wall' }).auto).toBe(true);
  });

  it('is idempotent on v5 state', () => {
    const first = migrateWorkbench({ tabs: { [P]: ['a'] }, activeTab: { [P]: 'a' } });
    const again = migrateWorkbench({
      grids: first.grids,
      layout: first.layout,
      cells: first.cells,
      focusCell: first.focusCell,
    });
    expect(again.grids).toEqual(first.grids);
    expect(again.tabs).toEqual(first.tabs);
    expect(again.cells).toEqual(first.cells);
  });
});
