import { beforeEach, describe, expect, it } from 'vitest';
import { emptyCells } from '@/lib/workbench';
import { devTabKey, isDevTab, migrateWorkbench, useWorkbenchStore } from './workbench-store';

const P = 'C:\\P\\A';
const B = 'C:\\P\\B';

describe('workbench store', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      tabs: {},
      activeTab: {},
      recency: [],
      view: { kind: 'overview' },
      auto: false,
      layout: '1x1',
      cells: emptyCells(),
      focusCell: null,
      autoTabs: [],
      seen: {},
    });
  });

  it('renames a tab in place after /new, keeping its cell, order and activity', () => {
    const s = useWorkbenchStore.getState();
    s.openTab(P, 'a');
    s.openTab(P, 'old');
    s.openTab(P, 'b');
    s.activate(P, 'old');
    useWorkbenchStore.getState().renameTab(P, 'old', 'new');
    const st = useWorkbenchStore.getState();
    expect(st.tabs[P]).toEqual(['a', 'new', 'b']);
    expect(st.activeTab[P]).toBe('new');
    expect(st.recency).not.toContain('old');
    expect(st.recency[0]).toBe('new');
    expect(st.cells[0]).toMatchObject({ projectPath: P, activeTab: 'new' });
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

  it('closing the active tab activates the last remaining tab of the project', () => {
    const st = useWorkbenchStore.getState();
    for (const k of ['a', 'b', 'c']) st.openTab(P, k);
    st.activate(P, 'a');
    st.closeTab(P, 'a');
    expect(useWorkbenchStore.getState().activeTab[P]).toBe('c');
    st.closeTab(P, 'b');
    expect(useWorkbenchStore.getState().activeTab[P]).toBe('c');
  });

  it('puts every opened and activated tab into a cell of its project', () => {
    const st = useWorkbenchStore.getState();
    st.openTab(P, 'a');
    st.openTab(P, 'b');
    let s = useWorkbenchStore.getState();
    expect(s.cells[0]).toMatchObject({ projectPath: P, activeTab: 'b', manual: true });
    expect(s.focusCell).toBe('c1');
    st.activate(P, 'a');
    s = useWorkbenchStore.getState();
    expect(s.cells[0]?.activeTab).toBe('a');
    expect(s.cells.filter((c) => c.projectPath === P)).toHaveLength(1);
  });

  it('marks dev tabs', () => {
    expect(isDevTab(devTabKey(P))).toBe(true);
    expect(isDevTab('8e5e1113-effe-47a2-832a-a2c5bf110aaf')).toBe(false);
  });

  it('defaults to overview, single layout and manual mode', () => {
    const st = useWorkbenchStore.getState();
    expect(st.view).toEqual({ kind: 'overview' });
    expect(st.layout).toBe('1x1');
    expect(st.auto).toBe(false);
  });

  it('switches autopilot', () => {
    useWorkbenchStore.getState().setAuto(true);
    expect(useWorkbenchStore.getState().auto).toBe(true);
    useWorkbenchStore.getState().setAuto(false);
    expect(useWorkbenchStore.getState().auto).toBe(false);
  });

  it('places selected projects in cells, pins and touches cells', () => {
    useWorkbenchStore.setState({ auto: true, layout: '2x2', cells: emptyCells(), focusCell: null });
    const st = useWorkbenchStore.getState();
    st.select({ kind: 'project', path: P });
    st.touchCell('c2');
    st.select({ kind: 'project', path: B });
    let s = useWorkbenchStore.getState();
    expect(s.cells.map((c) => c.projectPath)).toEqual([P, B, null, null]);
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

  it('select takes a free cell first, then the focus, and with auto an automatic cell', () => {
    const full = () =>
      emptyCells().map((c) => ({ ...c, projectPath: `C:\\P\\${c.id}`, activeTab: undefined }));
    useWorkbenchStore.setState({ auto: false, layout: '2x2', cells: full(), focusCell: 'c3' });
    useWorkbenchStore.getState().select({ kind: 'project', path: P });
    let s = useWorkbenchStore.getState();
    expect(s.focusCell).toBe('c3');
    expect(s.cells[2]?.projectPath).toBe(P);

    useWorkbenchStore.setState({ auto: true, cells: full(), focusCell: 'c3' });
    useWorkbenchStore.getState().select({ kind: 'project', path: P });
    s = useWorkbenchStore.getState();
    expect(s.focusCell).toBe('c1');
    expect(s.cells[0]?.projectPath).toBe(P);
    expect(s.cells[2]?.projectPath).toBe('C:\\P\\c3');
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
      auto: true,
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
      auto: true,
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
      auto: true,
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

  it('restored cells keep manual and pinned marks with their tabs, others forget the tab', () => {
    const state = migrateWorkbench({
      auto: true,
      layout: '2x2',
      view: { kind: 'overview' },
      cells: [
        { id: 'c1', projectPath: 'B', manual: true, activeTab: 'b-old' },
        { id: 'c2', projectPath: 'S', activeTab: `dev:S` },
        { id: 'c3', projectPath: P, pinned: true, activeTab: 'p1' },
      ],
      tabs: { B: ['b-old'], S: ['dev:S'], [P]: ['p1'] },
    });
    expect(state.auto).toBe(true);
    expect(state.cells?.[0]).toMatchObject({
      projectPath: 'B',
      manual: true,
      activeTab: 'b-old',
    });
    expect(state.cells?.[1]).toMatchObject({ projectPath: 'S', manual: false });
    expect(state.cells?.[1]?.activeTab).toBeUndefined();
    expect(state.cells?.[2]).toMatchObject({ pinned: true, activeTab: 'p1' });
    expect(state.cells?.[3]?.projectPath).toBeNull();
  });

  it('ignores a cell activation with a tab of another project', () => {
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
    expect(state.focusCell).toBe('c1');
    expect(state.auto).toBe(false);
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

  it('migrates a wall state into autopilot and puts the selected project into the first cell', () => {
    const state = migrateWorkbench({
      mode: 'wall',
      layout: '2x2',
      view: { kind: 'project', path: P },
    });
    expect(state.auto).toBe(true);
    expect('mode' in state).toBe(false);
    expect(state.cells?.map((c) => c.projectPath)).toEqual([P, null, null, null]);
    expect(state.cells?.[0]?.manual).toBe(true);
    expect(state.focusCell).toBe('c1');
    const broken = migrateWorkbench({ layout: '2x1', cells: 'x', view: { kind: 'overview' } });
    expect(broken.cells).toHaveLength(4);
    expect(broken.focusCell).toBe('c1');
  });

  it('migrates a wall state keeping its cells and the focus', () => {
    const cells = emptyCells().map((c) =>
      c.id === 'c2' ? { ...c, projectPath: B, pinned: true } : c,
    );
    const state = migrateWorkbench({
      mode: 'wall',
      layout: '2x1',
      cells,
      focusCell: 'c2',
      view: { kind: 'project', path: P },
      tabs: { [P]: ['a'] },
    });
    expect(state.auto).toBe(true);
    expect(state.cells?.map((c) => c.projectPath)).toEqual([null, B, null, null]);
    expect(state.cells?.[1]?.pinned).toBe(true);
    expect(state.focusCell).toBe('c2');
  });

  it('migrates a v3 project mode with a 2x1 project layout into two cells of the project', () => {
    const state = migrateWorkbench({
      mode: 'project',
      layout: '1x1',
      cells: emptyCells().map((c) => (c.id === 'c2' ? { ...c, projectPath: B, pinned: true } : c)),
      view: { kind: 'project', path: P },
      tabs: { [P]: ['a', 'b', 'gone-not', 3], [B]: [] },
      activeTab: { [P]: 'a' },
      projectLayouts: {
        [P]: {
          layout: '2x1',
          focus: 1,
          cells: [
            { tabs: ['a'], active: 'a' },
            { tabs: ['b'], active: 'b' },
            { tabs: [] },
            { tabs: [] },
          ],
        },
        [B]: { layout: '2x2', cells: [] },
      },
    });
    expect(state.auto).toBe(false);
    expect('mode' in state).toBe(false);
    expect('projectLayouts' in state).toBe(false);
    expect(state.layout).toBe('2x1');
    expect(state.cells?.map((c) => c.projectPath)).toEqual([P, P, B, null]);
    expect(state.cells?.[0]).toMatchObject({ manual: true, pinned: false, activeTab: 'a' });
    expect(state.cells?.[1]).toMatchObject({ manual: true, pinned: false, activeTab: 'b' });
    expect(state.cells?.[2]).toMatchObject({ id: 'c3', pinned: true });
    expect(state.cells?.[3]?.manual).toBe(false);
    expect(state.tabs?.[P]).toEqual(['a', 'b', 'gone-not']);
    expect(state.focusCell).toBe('c1');
    const again = migrateWorkbench(state);
    expect(again.cells).toEqual(state.cells);
    expect(again.layout).toBe('2x1');
    expect(again.auto).toBe(false);
  });

  it('moves a focus that points at a hidden cell onto the visible grid', () => {
    const state = migrateWorkbench({
      auto: false,
      layout: '1x1',
      focusCell: 'c2',
      cells: emptyCells().map((c) => (c.id === 'c1' ? { ...c, projectPath: P, manual: true } : c)),
      view: { kind: 'project', path: P },
      tabs: { [P]: [] },
    });
    expect(state.focusCell).toBe('c1');
  });

  it('migrates a v3 project mode: empty second cell stays free, no layout gives one cell', () => {
    const half = migrateWorkbench({
      mode: 'project',
      view: { kind: 'project', path: P },
      tabs: { [P]: ['a'] },
      projectLayouts: {
        [P]: { layout: '2x1', cells: [{ tabs: ['a'], active: 'a' }, { tabs: [] }] },
      },
    });
    expect(half.layout).toBe('2x1');
    expect(half.cells?.map((c) => c.projectPath)).toEqual([P, null, null, null]);

    const bare = migrateWorkbench({
      mode: 'project',
      view: { kind: 'project', path: P },
      tabs: { [P]: ['a', 'b'] },
    });
    expect(bare.layout).toBe('1x1');
    expect(bare.cells?.map((c) => c.projectPath)).toEqual([P, null, null, null]);
    expect(bare.cells?.[0]?.manual).toBe(true);
  });

  it('migrates a v3 project mode without a selected project leaving the stored cells', () => {
    const state = migrateWorkbench({
      mode: 'project',
      layout: '2x1',
      view: { kind: 'overview' },
      cells: emptyCells().map((c) => (c.id === 'c1' ? { ...c, projectPath: B, manual: true } : c)),
    });
    expect(state.auto).toBe(false);
    expect(state.layout).toBe('2x1');
    expect(state.cells?.[0]).toMatchObject({ projectPath: B, manual: true });
  });

  it('forgets that autopilot opened a tab once the user takes it', () => {
    useWorkbenchStore.setState({ tabs: { [P]: ['a', 'b', 'c'] }, autoTabs: ['a', 'b', 'c'] });
    const st = useWorkbenchStore.getState();
    st.activate(P, 'a');
    st.openTab(P, 'b');
    expect(useWorkbenchStore.getState().autoTabs).toEqual(['c']);
    st.closeTab(P, 'c');
    expect(useWorkbenchStore.getState().autoTabs).toEqual([]);
  });

  it('keeps the focused cell visible when the layout shrinks', () => {
    useWorkbenchStore.setState({
      layout: '2x2',
      cells: emptyCells().map((c, i) => ({ ...c, projectPath: ['A', 'B', 'C', 'D'][i] ?? null })),
      focusCell: 'c3',
    });
    useWorkbenchStore.getState().setLayout('1x1');
    const s = useWorkbenchStore.getState();
    expect(s.layout).toBe('1x1');
    expect(s.cells.map((c) => c.projectPath)).toEqual(['C', 'A', 'B', 'D']);
    expect(s.focusCell).toBe('c1');
  });

  it('keeps pinned and manual cells visible when the layout shrinks to two', () => {
    useWorkbenchStore.setState({
      layout: '2x2',
      cells: emptyCells().map((c, i) => ({
        ...c,
        projectPath: ['A', 'B', 'C', 'D'][i] ?? null,
        pinned: c.id === 'c3',
        manual: c.id === 'c4',
      })),
      focusCell: 'c1',
    });
    useWorkbenchStore.getState().setLayout('2x1');
    const s = useWorkbenchStore.getState();
    expect(s.cells.slice(0, 2).map((c) => c.projectPath)).toEqual(['A', 'C']);
    expect(s.cells[0]?.id).toBe('c1');
    expect(s.focusCell).toBe('c1');
  });

  it('places the selected project when the layout changes', () => {
    useWorkbenchStore.setState({
      layout: '2x2',
      view: { kind: 'project', path: B },
      cells: emptyCells().map((c) => (c.id === 'c4' ? { ...c, projectPath: B, manual: true } : c)),
      focusCell: 'c4',
    });
    useWorkbenchStore.getState().setLayout('1x1');
    const s = useWorkbenchStore.getState();
    expect(s.cells[0]?.projectPath).toBe(B);
    expect(s.focusCell).toBe('c1');
  });

  it('moves a tab into a chosen cell and reorders the tabs of the project', () => {
    useWorkbenchStore.setState({
      layout: '2x1',
      cells: emptyCells().map((c) => (c.id === 'c1' ? { ...c, projectPath: P } : c)),
      focusCell: null,
      view: { kind: 'project', path: P },
      tabs: { [P]: ['a', 'b'], [B]: ['x'] },
    });
    const st = useWorkbenchStore.getState();
    st.moveTabToWallCell('c2', B, 'x');
    const s = useWorkbenchStore.getState();
    expect(s.cells[1]).toMatchObject({ projectPath: B, manual: true, activeTab: 'x' });
    expect(s.focusCell).toBe('c2');
    expect(s.view).toEqual({ kind: 'project', path: B });
    st.moveTabToWallCell('c1', P, 'b', 0);
    expect(useWorkbenchStore.getState().tabs[P]).toEqual(['b', 'a']);
  });
});
