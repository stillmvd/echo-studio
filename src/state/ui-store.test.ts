import { describe, expect, it } from 'vitest';
import { useUiStore } from './ui-store';

describe('ui-store bulk selection', () => {
  it('clears memory bulk selection when filters change', () => {
    const s = useUiStore.getState();
    s.setBulkSelection(['a', 'b']);
    s.setStatus('archived');
    expect(useUiStore.getState().bulkSelectionIds).toEqual([]);

    s.setBulkSelection(['a']);
    s.toggleTag('rust');
    expect(useUiStore.getState().bulkSelectionIds).toEqual([]);
  });

  it('clears conversation bulk selection when project changes', () => {
    const s = useUiStore.getState();
    s.toggleConversationsBulkPath('C:/x/a.jsonl');
    s.setConversationsProjectId('other');
    expect(useUiStore.getState().conversationsBulkSelection).toEqual([]);
  });
});
