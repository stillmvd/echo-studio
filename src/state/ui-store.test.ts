import { describe, expect, it } from 'vitest';
import { migrateUiState, useUiStore } from './ui-store';

describe('ui-store', () => {
  it('clears conversation bulk selection when project changes', () => {
    const s = useUiStore.getState();
    s.toggleConversationsBulkPath('C:/x/a.jsonl');
    s.setConversationsProjectId('other');
    expect(useUiStore.getState().conversationsBulkSelection).toEqual([]);
  });

  it('turns a persisted memories tab into tools', () => {
    expect(
      migrateUiState({ activeTab: 'memories', projectsSort: 'name', toolsType: 'mcp' }),
    ).toEqual({
      activeTab: 'tools',
      projectsSort: 'name',
      toolsType: 'mcp',
    });
    expect(migrateUiState({ activeTab: 'workbench', toolsType: 'skill' })).toEqual({
      activeTab: 'workbench',
      toolsType: 'skill',
    });
  });

  it('replaces the old "all" tools type with skills', () => {
    expect(migrateUiState({ activeTab: 'tools', toolsType: 'all' })).toEqual({
      activeTab: 'tools',
      toolsType: 'skill',
    });
  });
});
