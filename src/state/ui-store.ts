import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppTab = 'memories' | 'conversations' | 'settings';
export type MemoryStatus = 'active' | 'archived' | 'all';
export type DetailMode = 'rendered' | 'raw';

interface UiState {
  activeTab: AppTab;
  selectedProject: string | null;
  selectedCategory: string | null;
  status: MemoryStatus;
  selectedMemoryId: string | null;
  detailMode: DetailMode;

  setActiveTab: (tab: AppTab) => void;
  setSelectedProject: (project: string | null) => void;
  setSelectedCategory: (category: string | null) => void;
  setStatus: (status: MemoryStatus) => void;
  setSelectedMemoryId: (id: string | null) => void;
  setDetailMode: (mode: DetailMode) => void;
  clearFilters: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeTab: 'memories',
      selectedProject: null,
      selectedCategory: null,
      status: 'active',
      selectedMemoryId: null,
      detailMode: 'rendered',

      setActiveTab: (activeTab) => set({ activeTab }),
      setSelectedProject: (selectedProject) => set({ selectedProject, selectedMemoryId: null }),
      setSelectedCategory: (selectedCategory) => set({ selectedCategory, selectedMemoryId: null }),
      setStatus: (status) => set({ status, selectedMemoryId: null }),
      setSelectedMemoryId: (selectedMemoryId) => set({ selectedMemoryId }),
      setDetailMode: (detailMode) => set({ detailMode }),
      clearFilters: () =>
        set({
          selectedProject: null,
          selectedCategory: null,
          status: 'active',
          selectedMemoryId: null,
        }),
    }),
    {
      name: 'echo-studio.ui',
      partialize: (s) => ({
        activeTab: s.activeTab,
        selectedProject: s.selectedProject,
        selectedCategory: s.selectedCategory,
        status: s.status,
        detailMode: s.detailMode,
      }),
    },
  ),
);
