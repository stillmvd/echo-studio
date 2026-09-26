import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KindFilter } from '@/lib/tooling';

export type AppTab = 'tools' | 'conversations' | 'settings';
export type ProjectSort = 'recent' | 'name' | 'sessions' | 'size';

interface UiState {
  activeTab: AppTab;
  conversationsProjectId: string | null;
  conversationsSortBy: 'date' | 'size' | 'duration' | 'msgs';
  conversationsSortDir: 'asc' | 'desc';
  selectedSessionPath: string | null;
  sessionSearchQuery: string;
  crossSessionSearchQuery: string;
  conversationsBulkSelection: string[];
  conversationsAgeFilter: 'all' | 'older30' | 'older90' | 'older365';
  projectsSort: ProjectSort;
  viewerShowSystem: boolean;
  viewerShowThinking: boolean;
  toolsScope: string | null;
  toolsType: KindFilter;
  toolsQuery: string;
  selectedToolId: string | null;
  toolsProjectOnly: boolean;
  toolToggleError: { id: string; message: string } | null;

  setActiveTab: (tab: AppTab) => void;
  setConversationsProjectId: (id: string | null) => void;
  setConversationsSort: (by: 'date' | 'size' | 'duration' | 'msgs', dir: 'asc' | 'desc') => void;
  setSelectedSessionPath: (path: string | null) => void;
  setSessionSearchQuery: (q: string) => void;
  setCrossSessionSearchQuery: (q: string) => void;
  toggleConversationsBulkPath: (path: string) => void;
  setConversationsBulkSelection: (paths: string[]) => void;
  clearConversationsBulkSelection: () => void;
  setProjectsSort: (sort: ProjectSort) => void;
  setConversationsAgeFilter: (f: 'all' | 'older30' | 'older90' | 'older365') => void;
  toggleViewerShowSystem: () => void;
  toggleViewerShowThinking: () => void;
  setToolsScope: (path: string | null) => void;
  setToolsType: (type: KindFilter) => void;
  setToolsQuery: (q: string) => void;
  setSelectedToolId: (id: string | null) => void;
  setToolsProjectOnly: (on: boolean) => void;
  setToolToggleError: (error: { id: string; message: string } | null) => void;
}

export function migrateUiState(persisted: unknown): unknown {
  if (typeof persisted !== 'object' || persisted === null) return persisted;
  const state = persisted as { activeTab?: unknown };
  return state.activeTab === 'memories' ? { ...state, activeTab: 'tools' } : state;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeTab: 'tools',
      conversationsProjectId: null,
      conversationsSortBy: 'date',
      conversationsSortDir: 'desc',
      selectedSessionPath: null,
      sessionSearchQuery: '',
      crossSessionSearchQuery: '',
      conversationsBulkSelection: [],
      conversationsAgeFilter: 'all',
      projectsSort: 'recent',
      viewerShowSystem: false,
      viewerShowThinking: false,
      toolsScope: null,
      toolsType: 'all',
      toolsQuery: '',
      selectedToolId: null,
      toolsProjectOnly: false,
      toolToggleError: null,

      setActiveTab: (activeTab) => set({ activeTab }),
      setConversationsProjectId: (conversationsProjectId) =>
        set({ conversationsProjectId, selectedSessionPath: null, conversationsBulkSelection: [] }),
      setConversationsSort: (conversationsSortBy, conversationsSortDir) =>
        set({ conversationsSortBy, conversationsSortDir }),
      setSelectedSessionPath: (selectedSessionPath) =>
        set({ selectedSessionPath, sessionSearchQuery: '' }),
      setSessionSearchQuery: (sessionSearchQuery) => set({ sessionSearchQuery }),
      setCrossSessionSearchQuery: (crossSessionSearchQuery) => set({ crossSessionSearchQuery }),
      toggleConversationsBulkPath: (path) =>
        set((s) => ({
          conversationsBulkSelection: s.conversationsBulkSelection.includes(path)
            ? s.conversationsBulkSelection.filter((p) => p !== path)
            : [...s.conversationsBulkSelection, path],
        })),
      setConversationsBulkSelection: (conversationsBulkSelection) =>
        set({ conversationsBulkSelection }),
      clearConversationsBulkSelection: () => set({ conversationsBulkSelection: [] }),
      setProjectsSort: (projectsSort) => set({ projectsSort }),
      setConversationsAgeFilter: (conversationsAgeFilter) =>
        set({ conversationsAgeFilter, conversationsBulkSelection: [] }),
      toggleViewerShowSystem: () => set((s) => ({ viewerShowSystem: !s.viewerShowSystem })),
      toggleViewerShowThinking: () => set((s) => ({ viewerShowThinking: !s.viewerShowThinking })),
      setToolsScope: (toolsScope) =>
        set({ toolsScope, selectedToolId: null, toolToggleError: null }),
      setToolsType: (toolsType) => set({ toolsType }),
      setToolsQuery: (toolsQuery) => set({ toolsQuery }),
      setSelectedToolId: (selectedToolId) =>
        set((s) => ({
          selectedToolId,
          toolToggleError: s.toolToggleError?.id === selectedToolId ? s.toolToggleError : null,
        })),
      setToolsProjectOnly: (toolsProjectOnly) => set({ toolsProjectOnly }),
      setToolToggleError: (toolToggleError) => set({ toolToggleError }),
    }),
    {
      name: 'echo-studio.ui',
      version: 1,
      migrate: (persisted) => migrateUiState(persisted) as UiState,
      partialize: (s) => ({
        activeTab: s.activeTab,
        conversationsProjectId: s.conversationsProjectId,
        conversationsSortBy: s.conversationsSortBy,
        conversationsSortDir: s.conversationsSortDir,
        conversationsAgeFilter: s.conversationsAgeFilter,
        projectsSort: s.projectsSort,
        viewerShowSystem: s.viewerShowSystem,
        viewerShowThinking: s.viewerShowThinking,
        toolsScope: s.toolsScope,
        toolsType: s.toolsType,
      }),
    },
  ),
);
