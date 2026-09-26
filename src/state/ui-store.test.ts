import { describe, expect, it } from 'vitest';
import { migrateUiState, useUiStore } from './ui-store';

describe('ui-store', () => {
  it('clears conversation bulk selection when project changes', () => {
    const s = useUiStore.getState();
    s.toggleConversationsBulkPath('C:/x/a.jsonl');
    s.setConversationsProjectId('other');
    expect(useUiStore.getState().conversationsBulkSelection).toEqual([]);
  });

  it('keeps a toggle error only while its tool is selected', () => {
    const s = useUiStore.getState();
    s.setToolToggleError({ id: 'a', message: 'denied' });
    s.setSelectedToolId('a');
    expect(useUiStore.getState().toolToggleError?.message).toBe('denied');
    s.setSelectedToolId('b');
    expect(useUiStore.getState().toolToggleError).toBeNull();
  });

  it('turns a persisted memories tab into tools', () => {
    expect(migrateUiState({ activeTab: 'memories', projectsSort: 'name' })).toEqual({
      activeTab: 'tools',
      projectsSort: 'name',
    });
    expect(migrateUiState({ activeTab: 'conversations' })).toEqual({ activeTab: 'conversations' });
  });
});
