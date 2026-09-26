import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '@/state/ui-store';
import { createNavHistory } from './nav-history';

describe('nav history', () => {
  beforeEach(() => {
    useUiStore.setState({
      activeTab: 'conversations',
      conversationsProjectId: 'a',
      selectedSessionPath: null,
      conversationsBulkSelection: [],
    });
  });

  it('walks back and forward through views', () => {
    const h = createNavHistory(useUiStore);
    const s = useUiStore.getState();
    s.setSelectedSessionPath('a/1.jsonl');
    s.setSelectedSessionPath(null);
    s.setConversationsProjectId('b');

    expect(h.back()).toBe(true);
    expect(useUiStore.getState().conversationsProjectId).toBe('a');
    expect(h.back()).toBe(true);
    expect(useUiStore.getState().selectedSessionPath).toBe('a/1.jsonl');
    expect(h.forward()).toBe(true);
    expect(useUiStore.getState().selectedSessionPath).toBeNull();
    h.unsubscribe();
  });

  it('drops forward history after a new navigation', () => {
    const h = createNavHistory(useUiStore);
    useUiStore.getState().setActiveTab('settings');
    h.back();
    useUiStore.getState().setActiveTab('tools');
    expect(h.forward()).toBe(false);
    expect(h.back()).toBe(true);
    expect(useUiStore.getState().activeTab).toBe('conversations');
    h.unsubscribe();
  });
});
