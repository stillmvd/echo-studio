import { beforeEach, describe, expect, it } from 'vitest';
import { emptyCells } from '@/lib/workbench';
import { seedRecent, useRecentStore, withoutVisit } from './recent-store';
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

  it('does not count closing a tab as a visit', () => {
    const s = useWorkbenchStore.getState();
    s.openTab(P, 'a');
    s.openTab(P, 'b');
    s.activate(P, 'a');
    s.closeTab(P, 'a');
    expect(useRecentStore.getState().history).toEqual(['a', 'b']);
  });

  it('seeds an empty history from the workbench recency once', () => {
    useWorkbenchStore.setState({ recency: ['b', devTabKey(P), 'a'] });
    useRecentStore.setState({ history: [] });
    seedRecent();
    expect(useRecentStore.getState().history).toEqual(['b', 'a']);
    useWorkbenchStore.setState({ recency: ['c'] });
    seedRecent();
    expect(useRecentStore.getState().history).toEqual(['b', 'a']);
  });

  it('ignores activations made without the user', () => {
    const s = useWorkbenchStore.getState();
    s.openTab(P, 'a');
    withoutVisit(() => s.openTab(P, 'b'));
    expect(useRecentStore.getState().history).toEqual(['a']);
    s.activate(P, 'a');
    s.activate(P, 'b');
    expect(useRecentStore.getState().history).toEqual(['b', 'a']);
  });

  it('skips dev tabs', () => {
    const s = useWorkbenchStore.getState();
    s.openTab(P, 'a');
    s.openTab(P, devTabKey(P));
    expect(useRecentStore.getState().history).toEqual(['a']);
  });
});
