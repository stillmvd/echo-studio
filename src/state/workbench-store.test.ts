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
    });
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
    useWorkbenchStore.setState({ layout: '2x2', cells: emptyCells(), focusCell: null });
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
    useWorkbenchStore.getState().touchCell('c2');
    expect(useWorkbenchStore.getState().seen.sess).toBeGreaterThan(0);
  });

  it('shows a session opened from outside in the cell that holds the project', () => {
    useWorkbenchStore.setState({
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

  it('normalizes garbage layout and view', () => {
    const state = migrateWorkbench({
      layout: '9x9',
      view: { kind: 'project', path: 7 },
      focusCell: 'zz',
    });
    expect(state.layout).toBe('1x1');
    expect(state.view).toEqual({ kind: 'overview' });
    expect(state.focusCell).toBeNull();
    expect(migrateWorkbench(null).cells).toHaveLength(4);
  });

  it('migrates v1 with a wall layout and a selected project into the first cell', () => {
    const state = migrateWorkbench({ layout: '2x2', view: { kind: 'project', path: P } });
    expect(state.cells?.map((c) => c.projectPath)).toEqual([P, null, null, null]);
    expect(state.cells?.[0]?.manual).toBe(true);
    expect(state.focusCell).toBe('c1');
    const broken = migrateWorkbench({ layout: '2x1', cells: 'x', view: { kind: 'overview' } });
    expect(broken.cells).toHaveLength(4);
    expect(broken.focusCell).toBeNull();
  });
});
