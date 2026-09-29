import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  KindFilter as MemoryKindFilter,
  StatusFilter as MemoryStatusFilter,
} from '@/lib/memory';
import type { KindFilter } from '@/lib/tooling';

export type AppTab = 'tools' | 'memory' | 'conversations' | 'settings';
export type MemoryTab = 'records' | 'sessions' | 'archive';
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
  toolsOpenGroups: string[];
  toolToggleError: { id: string; message: string } | null;
  toolsOverriddenOnly: boolean;
  memorySlug: string | null;
  memoryTab: MemoryTab;
  memoryStatus: MemoryStatusFilter;
  memoryKind: MemoryKindFilter;
  memoryQuery: string;
  selectedMemoryPath: string | null;
  memoryDirty: boolean;
  memoryGuard: (() => void) | null;
  memoryDupes: boolean;

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
  toggleToolsGroup: (key: string) => void;
  setToolToggleError: (error: { id: string; message: string } | null) => void;
  setToolsOverriddenOnly: (on: boolean) => void;
  setMemorySlug: (slug: string | null) => void;
  setMemoryTab: (tab: MemoryTab) => void;
  setMemoryStatus: (status: MemoryStatusFilter) => void;
  setMemoryKind: (kind: MemoryKindFilter) => void;
  setMemoryQuery: (q: string) => void;
  setSelectedMemoryPath: (path: string | null) => void;
  openMemoryRecord: (slug: string, path: string) => void;
  setMemoryDirty: (dirty: boolean) => void;
  setMemoryGuard: (action: (() => void) | null) => void;
  setMemoryDupes: (on: boolean) => void;
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
      toolsOpenGroups: [],
      toolToggleError: null,
      toolsOverriddenOnly: false,
      memorySlug: null,
      memoryTab: 'records',
      memoryStatus: 'all',
      memoryKind: 'all',
      memoryQuery: '',
      selectedMemoryPath: null,
      memoryDirty: false,
      memoryGuard: null,
      memoryDupes: false,

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
        set({
          toolsScope,
          selectedToolId: null,
          toolToggleError: null,
          toolsOverriddenOnly: false,
        }),
      setToolsType: (toolsType) => set({ toolsType }),
      setToolsQuery: (toolsQuery) => set({ toolsQuery }),
      setSelectedToolId: (selectedToolId) =>
        set((s) => ({
          selectedToolId,
          toolToggleError: s.toolToggleError?.id === selectedToolId ? s.toolToggleError : null,
        })),
      toggleToolsGroup: (key) =>
        set((s) => ({
          toolsOpenGroups: s.toolsOpenGroups.includes(key)
            ? s.toolsOpenGroups.filter((k) => k !== key)
            : [...s.toolsOpenGroups, key],
        })),
      setToolToggleError: (toolToggleError) => set({ toolToggleError }),
      setToolsOverriddenOnly: (toolsOverriddenOnly) => set({ toolsOverriddenOnly }),
      setMemorySlug: (memorySlug) =>
        set({
          memorySlug,
          memoryDupes: false,
          memoryStatus: 'all',
          memoryKind: 'all',
          memoryQuery: '',
          selectedMemoryPath: null,
        }),
      setMemoryTab: (memoryTab) => set({ memoryTab, selectedMemoryPath: null }),
      setMemoryStatus: (memoryStatus) => set({ memoryStatus }),
      setMemoryKind: (memoryKind) => set({ memoryKind }),
      setMemoryQuery: (memoryQuery) => set({ memoryQuery }),
      setSelectedMemoryPath: (selectedMemoryPath) => set({ selectedMemoryPath }),
      setMemoryDirty: (memoryDirty) => set({ memoryDirty }),
      setMemoryGuard: (memoryGuard) => set({ memoryGuard }),
      setMemoryDupes: (memoryDupes) => set({ memoryDupes, selectedMemoryPath: null }),
      openMemoryRecord: (memorySlug, selectedMemoryPath) =>
        set({
          memorySlug,
          memoryDupes: false,
          memoryTab: 'records',
          memoryStatus: 'all',
          memoryKind: 'all',
          memoryQuery: '',
          selectedMemoryPath,
        }),
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
        toolsOpenGroups: s.toolsOpenGroups,
        memorySlug: s.memorySlug,
        memoryTab: s.memoryTab,
      }),
    },
  ),
);

export function guardMemory(action: () => void): void {
  const s = useUiStore.getState();
  if (s.memoryDirty) s.setMemoryGuard(action);
  else action();
}

export function goToTab(tab: AppTab): void {
  const s = useUiStore.getState();
  if (s.activeTab === tab) return;
  if (s.activeTab === 'memory') guardMemory(() => useUiStore.getState().setActiveTab(tab));
  else s.setActiveTab(tab);
}
