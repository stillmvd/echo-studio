import { beforeEach, describe, expect, it } from 'vitest';
import { emptyCells } from '@/lib/workbench';
import { devTabKey, isDevTab, useWorkbenchStore } from './workbench-store';

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
    s.pinCell('c1');
    expect(useWorkbenchStore.getState().cells[0]).toMatchObject({ pinned: false, manual: false });
  });
});
