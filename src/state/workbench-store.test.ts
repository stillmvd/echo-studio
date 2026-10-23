import { beforeEach, describe, expect, it } from 'vitest';
import { emptyCells } from '@/lib/workbench';
import { devTabKey, isDevTab, migrateWorkbench, useWorkbenchStore } from './workbench-store';

const P = 'C:\\P\\A';

describe('workbench store', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      tabs: {},
      activeTab: {},
      recency: [],
      view: { kind: 'overview' },
      mode: 'project',
      projectLayouts: {},
      layout: '1x1',
      cells: emptyCells(),
      focusCell: null,
    });
  });

  it('renames a tab in place after /new, keeping its cell, order and activity', () => {
    const s = useWorkbenchStore.getState();
    s.openTab(P, 'a');
    s.openTab(P, 'old');
    s.openTab(P, 'b');
    s.setProjectLayout(P, '2x1');
    s.moveTab(P, 'old', 1);
    s.activate(P, 'old');
    useWorkbenchStore.getState().renameTab(P, 'old', 'new');
    const st = useWorkbenchStore.getState();
    expect(st.tabs[P]).toEqual(['a', 'new', 'b']);
    expect(st.activeTab[P]).toBe('new');
    expect(st.recency).not.toContain('old');
    expect(st.recency[0]).toBe('new');
    expect(st.projectLayouts[P]?.cells[1]).toEqual({ tabs: ['new'], active: 'new' });
  });

  it('leaves tabs alone when the new key is already open', () => {
    const s = useWorkbenchStore.getState();
    s.openTab(P, 'old');
    s.openTab(P, 'new');
    const before = useWorkbenchStore.getState().tabs;
    useWorkbenchStore.getState().renameTab(P, 'old', 'new');
    expect(useWorkbenchStore.getState().tabs).toBe(before);
  });

  it('opens, activates and closes tabs with recency', () => {
    const s = useWorkbenchStore.getState();
    s.openTab(P, 'a');
    s.openTab(P, 'b');
    s.openTab(P, 'a');
    let st = useWorkbenchStore.getState();
    expect(st.tabs[P]).toEqual(['a', 'b']);
    expect(st.activeTab[P]).toBe('a');
    expect(st.recency).toEqual(['a', 'b']);

    st.closeTab(P, 'a');
    st = useWorkbenchStore.getState();
    expect(st.tabs[P]).toEqual(['b']);
    expect(st.activeTab[P]).toBe('b');
    expect(st.recency).toEqual(['b']);

    st.closeTab(P, 'b');
    expect(useWorkbenchStore.getState().activeTab[P]).toBeUndefined();
  });

  it('marks dev tabs', () => {
    expect(isDevTab(devTabKey(P))).toBe(true);
    expect(isDevTab('8e5e1113-effe-47a2-832a-a2c5bf110aaf')).toBe(false);
  });

  it('defaults to overview and single layout', () => {
    const st = useWorkbenchStore.getState();
    expect(st.view).toEqual({ kind: 'overview' });
    expect(st.layout).toBe('1x1');
  });

  it('places selected projects in wall cells, pins and touches cells', () => {
    useWorkbenchStore.setState({
      mode: 'wall',
      layout: '2x2',
      cells: emptyCells(),
      focusCell: null,
    });
    const st = useWorkbenchStore.getState();
    st.select({ kind: 'project', path: P });
    st.touchCell('c2');
    st.select({ kind: 'project', path: 'C:\\P\\B' });
    let s = useWorkbenchStore.getState();
    expect(s.cells.map((c) => c.projectPath)).toEqual([P, 'C:\\P\\B', null, null]);
    expect(s.cells[1]?.manual).toBe(true);
    s.touchCell('c1');
    s = useWorkbenchStore.getState();
    expect(s.view).toEqual({ kind: 'project', path: P });
    expect(s.cells[0]?.lastInputAt).toBeGreaterThan(0);
    s.pinCell('c1');
    expect(useWorkbenchStore.getState().cells[0]).toMatchObject({ pinned: false, manual: false });
    s.pinCell('c1');
    expect(useWorkbenchStore.getState().cells[0]).toMatchObject({ pinned: true, manual: false });
  });

  it('marks the active session of a focused cell as seen', () => {
    useWorkbenchStore.setState({
      layout: '2x2',
      cells: emptyCells().map((c) => (c.id === 'c2' ? { ...c, projectPath: P } : c)),
      tabs: { [P]: ['sess'] },
      activeTab: { [P]: 'sess' },
      seen: {},
    });
    useWorkbenchStore.getState().touchCell('c2', 'sess');
    expect(useWorkbenchStore.getState().seen.sess).toBeGreaterThan(0);
  });

  it('shows a session opened from outside in the cell that holds the project', () => {
    useWorkbenchStore.setState({
      mode: 'wall',
      layout: '2x2',
      cells: emptyCells().map((c) => (c.id === 'c3' ? { ...c, projectPath: P } : c)),
      focusCell: 'c1',
      tabs: { [P]: ['a', 'b'] },
      activeTab: { [P]: 'a' },
    });
    const st = useWorkbenchStore.getState();
    st.activateCell('c3', 'a');
    st.openTab(P, 'b');
    expect(useWorkbenchStore.getState().cells[2]?.activeTab).toBe('b');
    st.activate(P, 'a');
    expect(useWorkbenchStore.getState().cells[2]?.activeTab).toBe('a');
    st.closeTab(P, 'a');
    expect(useWorkbenchStore.getState().cells[2]?.activeTab).toBeUndefined();
  });

  it('moves a project out of a hidden cell with the tab picked last', () => {
    useWorkbenchStore.setState({
      mode: 'wall',
      layout: '1x1',
      view: { kind: 'overview' },
      cells: emptyCells().map((c) =>
        c.id === 'c3' ? { ...c, projectPath: P, activeTab: 't1' } : c,
      ),
      focusCell: 'c1',
      tabs: { [P]: ['t1', 't2'] },
      activeTab: { [P]: 't1' },
    });
    const st = useWorkbenchStore.getState();
    st.openTab(P, 't2');
    st.select({ kind: 'project', path: P });
    const s = useWorkbenchStore.getState();
    expect(s.cells[0]?.projectPath).toBe(P);
    expect(s.cells[0]).toMatchObject({ activeTab: 't2', manual: true });
    expect(s.cells[2]?.projectPath).toBeNull();
    expect(s.activeTab[P]).toBe('t2');
  });

  it('an explicit tab choice holds an automatic cell', () => {
    useWorkbenchStore.setState({
      mode: 'wall',
      layout: '2x2',
      cells: emptyCells().map((c) => (c.id === 'c2' ? { ...c, projectPath: P } : c)),
      focusCell: 'c1',
      tabs: { [P]: ['a', `dev:${P}`] },
      activeTab: { [P]: 'a' },
    });
    const st = useWorkbenchStore.getState();
    st.activateCell('c2', 'a');
    expect(useWorkbenchStore.getState().cells[1]).toMatchObject({ activeTab: 'a', manual: true });
    useWorkbenchStore.setState({
      cells: emptyCells().map((c) => (c.id === 'c2' ? { ...c, projectPath: P } : c)),
    });
    st.openTab(P, `dev:${P}`);
    expect(useWorkbenchStore.getState().cells[1]).toMatchObject({
      activeTab: `dev:${P}`,
      manual: true,
    });
    useWorkbenchStore.setState({
      cells: emptyCells().map((c) => (c.id === 'c2' ? { ...c, projectPath: P, pinned: true } : c)),
    });
    st.activateCell('c2', 'a');
    expect(useWorkbenchStore.getState().cells[1]).toMatchObject({ pinned: true, manual: false });
  });

  it('migration resets unpinned restored cells and keeps pinned ones', () => {
    const state = migrateWorkbench({
      mode: 'wall',
      layout: '2x2',
      view: { kind: 'overview' },
      cells: [
        { id: 'c1', projectPath: 'B', manual: true, activeTab: 'b-old' },
        { id: 'c2', projectPath: 'S', activeTab: `dev:S` },
        { id: 'c3', projectPath: P, pinned: true, activeTab: 'p1' },
      ],
      tabs: { B: ['b-old'], S: ['dev:S'], [P]: ['p1'] },
    });
    expect(state.cells?.[0]).toMatchObject({
      projectPath: 'B',
      manual: false,
      activeTab: undefined,
    });
    expect(state.cells?.[1]).toMatchObject({ projectPath: 'S', activeTab: undefined });
    expect(state.cells?.[2]).toMatchObject({ pinned: true, activeTab: 'p1' });
    expect(state.cells?.[3]?.projectPath).toBeNull();
  });

  it('ignores a cell activation with a tab of another project', () => {
    const B = 'C:\\P\\B';
    useWorkbenchStore.setState({
      cells: emptyCells().map((c) => (c.id === 'c1' ? { ...c, projectPath: B } : c)),
      tabs: { [P]: ['x'], [B]: ['y'] },
      activeTab: { [B]: 'y' },
    });
    useWorkbenchStore.getState().activateCell('c1', 'x');
    const s = useWorkbenchStore.getState();
    expect(s.cells[0]?.activeTab).toBeUndefined();
    expect(s.activeTab[B]).toBe('y');
    expect(s.activeTab[P]).toBeUndefined();
  });

  it('normalizes garbage layout and view', () => {
    const state = migrateWorkbench({
      layout: '9x9',
      view: { kind: 'project', path: 7 },
      focusCell: 'zz',
    });
    expect(state.layout).toBe('1x1');
    expect(migrateWorkbench({ layout: 'toString' }).layout).toBe('1x1');
    expect(state.view).toEqual({ kind: 'overview' });
    expect(state.focusCell).toBeNull();
    expect(migrateWorkbench(null).cells).toHaveLength(4);
  });

  it('hides and unhides projects by path', () => {
    useWorkbenchStore.setState({ hiddenProjects: [] });
    const st = useWorkbenchStore.getState();
    st.hideProject(P);
    st.hideProject('c:/p/a/');
    expect(useWorkbenchStore.getState().hiddenProjects).toEqual([P]);
    st.unhideProject('c:/P/a');
    expect(useWorkbenchStore.getState().hiddenProjects).toEqual([]);
    expect(migrateWorkbench({}).hiddenProjects).toEqual([]);
    expect(migrateWorkbench({ hiddenProjects: [P, 3] }).hiddenProjects).toEqual([P]);
  });

  it('migrates v1 with a wall layout and a selected project into the first cell', () => {
    const state = migrateWorkbench({
      mode: 'wall',
      layout: '2x2',
      view: { kind: 'project', path: P },
    });
    expect(state.cells?.map((c) => c.projectPath)).toEqual([P, null, null, null]);
    expect(state.cells?.[0]?.manual).toBe(true);
    expect(state.focusCell).toBe('c1');
    const broken = migrateWorkbench({ layout: '2x1', cells: 'x', view: { kind: 'overview' } });
    expect(broken.cells).toHaveLength(4);
    expect(broken.focusCell).toBeNull();
  });

  it('migrates v2 tabs into the first cell of each project layout, wall cells kept', () => {
    const B = 'C:\\P\\B';
    const cells = emptyCells().map((c) =>
      c.id === 'c2' ? { ...c, projectPath: B, pinned: true } : c,
    );
    const state = migrateWorkbench({
      layout: '2x1',
      cells,
      focusCell: 'c2',
      view: { kind: 'project', path: P },
      tabs: { [P]: ['a', 'b', 3], [B]: [] },
      activeTab: { [P]: 'a' },
    });
    expect(state.mode).toBe('project');
    expect(state.layout).toBe('2x1');
    expect(state.cells?.map((c) => c.projectPath)).toEqual([null, B, null, null]);
    expect(state.cells?.[1]?.pinned).toBe(true);
    expect(state.focusCell).toBe('c2');
    expect(state.tabs?.[P]).toEqual(['a', 'b']);
    expect(state.projectLayouts?.[B]).toBeUndefined();
    expect(state.projectLayouts?.[P]).toEqual({
      layout: '1x1',
      focus: 0,
      cells: [{ tabs: ['a', 'b'], active: 'a' }, { tabs: [] }, { tabs: [] }, { tabs: [] }],
    });
    const again = migrateWorkbench(state);
    expect(again.projectLayouts).toEqual(state.projectLayouts);
  });

  it('keeps each project layout and puts new tabs into the focused cell', () => {
    const B = 'C:\\P\\B';
    const st = useWorkbenchStore.getState();
    st.openTab(P, 'claude');
    st.openTab(P, devTabKey(P));
    st.setProjectLayout(P, '2x1');
    st.moveTab(P, devTabKey(P), 1);
    let s = useWorkbenchStore.getState();
    expect(s.projectLayouts[P]?.cells.map((c) => c.tabs)).toEqual([
      ['claude'],
      [devTabKey(P)],
      [],
      [],
    ]);
    expect(s.projectLayouts[P]?.focus).toBe(1);
    expect(s.layout).toBe('1x1');

    st.select({ kind: 'project', path: B });
    st.openTab(B, 'other');
    st.select({ kind: 'project', path: P });
    s = useWorkbenchStore.getState();
    expect(s.projectLayouts[B]?.layout).toBe('1x1');
    expect(s.projectLayouts[P]?.layout).toBe('2x1');
    expect(s.cells.every((c) => c.projectPath === null)).toBe(true);

    st.openTab(P, 'second');
    expect(useWorkbenchStore.getState().projectLayouts[P]?.cells[1]?.tabs).toEqual([
      devTabKey(P),
      'second',
    ]);
    st.activate(P, 'claude');
    s = useWorkbenchStore.getState();
    expect(s.projectLayouts[P]?.focus).toBe(0);
    expect(s.activeTab[P]).toBe('claude');

    st.closeTab(P, 'claude');
    s = useWorkbenchStore.getState();
    expect(s.projectLayouts[P]?.layout).toBe('1x1');
    expect(s.projectLayouts[P]?.cells[0]).toEqual({
      tabs: [devTabKey(P), 'second'],
      active: 'second',
    });
    expect(s.projectLayouts[P]?.focus).toBe(0);
    expect(s.activeTab[P]).toBe('second');

    st.setProjectLayout(P, '2x1');
    st.moveTab(P, 'second', 1);
    st.focusProjectCell(P, 3);
    expect(useWorkbenchStore.getState().projectLayouts[P]?.focus).toBe(1);
    st.focusProjectCell(P, 0);
    st.activateInCell(P, 1, 'second');
    s = useWorkbenchStore.getState();
    expect(s.projectLayouts[P]?.cells[1]?.active).toBe('second');
    expect(s.projectLayouts[P]?.focus).toBe(1);

    st.setProjectLayout(P, '1x1');
    expect(useWorkbenchStore.getState().projectLayouts[P]?.cells[0]?.tabs).toEqual([
      devTabKey(P),
      'second',
    ]);
  });

  it('collapses to 1x1 only when closing leaves one filled cell out of several', () => {
    const st = useWorkbenchStore.getState();
    st.openTab(P, 'a');
    st.openTab(P, devTabKey(P));
    st.setProjectLayout(P, '2x1');
    st.moveTab(P, devTabKey(P), 1);
    st.closeTab(P, devTabKey(P));
    let s = useWorkbenchStore.getState();
    expect(s.projectLayouts[P]?.layout).toBe('1x1');
    expect(s.projectLayouts[P]?.cells[0]).toEqual({ tabs: ['a'], active: 'a' });
    expect(s.activeTab[P]).toBe('a');

    st.openTab(P, 'b');
    st.setProjectLayout(P, '2x2');
    st.closeTab(P, 'b');
    s = useWorkbenchStore.getState();
    expect(s.projectLayouts[P]?.layout).toBe('2x2');

    st.closeTab(P, 'a');
    expect(useWorkbenchStore.getState().projectLayouts[P]?.layout).toBe('2x2');
  });

  it('forgets that the wall opened a tab once the user takes it', () => {
    useWorkbenchStore.setState({ tabs: { [P]: ['a', 'b', 'c'] }, autoTabs: ['a', 'b', 'c'] });
    const st = useWorkbenchStore.getState();
    st.activate(P, 'a');
    st.openTab(P, 'b');
    expect(useWorkbenchStore.getState().autoTabs).toEqual(['c']);
    st.closeTab(P, 'c');
    expect(useWorkbenchStore.getState().autoTabs).toEqual([]);
  });

  it('empties a cell when its last tab moves away and keeps the layout', () => {
    const st = useWorkbenchStore.getState();
    st.openTab(P, 'a');
    st.setProjectLayout(P, '2x1');
    st.moveTab(P, 'a', 1);
    st.moveTab(P, 'a', 0);
    const l = useWorkbenchStore.getState().projectLayouts[P];
    expect(l?.layout).toBe('2x1');
    expect(l?.cells[1]).toEqual({ tabs: [] });
    expect(l?.cells[0]).toEqual({ tabs: ['a'], active: 'a' });
  });

  it('activates the neighbour in the same cell when the active tab closes', () => {
    const st = useWorkbenchStore.getState();
    for (const k of ['a', 'b', 'c', 'x']) st.openTab(P, k);
    st.setProjectLayout(P, '2x1');
    st.moveTab(P, 'x', 1);
    st.activate(P, 'b');
    st.closeTab(P, 'b');
    let s = useWorkbenchStore.getState();
    expect(s.projectLayouts[P]?.cells[0]).toEqual({ tabs: ['a', 'c'], active: 'c' });
    expect(s.activeTab[P]).toBe('c');
    st.closeTab(P, 'c');
    s = useWorkbenchStore.getState();
    expect(s.projectLayouts[P]?.cells[0]?.active).toBe('a');
    expect(s.activeTab[P]).toBe('a');
    expect(s.projectLayouts[P]?.cells[1]?.active).toBe('x');
  });

  it('places the project in the wall on switching modes and drops tabs into wall cells', () => {
    const B = 'C:\\P\\B';
    useWorkbenchStore.setState({
      layout: '2x1',
      cells: emptyCells(),
      focusCell: null,
      view: { kind: 'project', path: P },
      tabs: { [P]: ['a', 'b'], [B]: ['x'] },
    });
    const st = useWorkbenchStore.getState();
    st.setMode('wall');
    let s = useWorkbenchStore.getState();
    expect(s.mode).toBe('wall');
    expect(s.cells[0]?.projectPath).toBe(P);
    st.moveTabToWallCell('c2', B, 'x');
    s = useWorkbenchStore.getState();
    expect(s.cells[1]).toMatchObject({ projectPath: B, manual: true, activeTab: 'x' });
    expect(s.focusCell).toBe('c2');
    expect(s.view).toEqual({ kind: 'project', path: B });
    st.moveTabToWallCell('c1', P, 'b', 0);
    expect(useWorkbenchStore.getState().tabs[P]).toEqual(['b', 'a']);
    st.setMode('project');
    expect(useWorkbenchStore.getState().cells[1]?.projectPath).toBe(B);
  });
});
