import { beforeEach, describe, expect, it } from 'vitest';
import { emptyCells } from '@/lib/workbench';
import { useRecentStore } from './recent-store';
import { devTabKey, useWorkbenchStore } from './workbench-store';

const P = 'C:\\P\\A';

describe('recent sessions', () => {
  beforeEach(() => {
    useRecentStore.setState({ history: [] });
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

  it('records each activated session once, the latest first', () => {
    const s = useWorkbenchStore.getState();
    s.openTab(P, 'a');
    s.openTab(P, 'b');
    s.activate(P, 'a');
    expect(useRecentStore.getState().history).toEqual(['a', 'b']);
  });

  it('skips dev tabs', () => {
    const s = useWorkbenchStore.getState();
    s.openTab(P, 'a');
    s.openTab(P, devTabKey(P));
    expect(useRecentStore.getState().history).toEqual(['a']);
  });
});
