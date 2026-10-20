import { beforeEach, describe, expect, it } from 'vitest';
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
});
