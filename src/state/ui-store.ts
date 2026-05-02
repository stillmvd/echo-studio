import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SearchMode, SortBy } from '@/lib/types';

export type AppTab = 'memories' | 'conversations' | 'settings';
export type MemoryStatus = 'active' | 'archived' | 'all';
export type DetailMode = 'rendered' | 'raw';
export type DateRangePreset = 'all' | 'last7' | 'last30' | 'last90';

interface UiState {
  activeTab: AppTab;
  selectedProject: string | null;
  selectedCategory: string | null;
  status: MemoryStatus;
  selectedMemoryId: string | null;
  detailMode: DetailMode;
  searchQuery: string;
  searchMode: SearchMode;
  selectedTags: string[];
  dateRange: DateRangePreset;
  sortBy: SortBy;
  bulkSelectionIds: string[];
  conversationsProjectId: string | null;
  conversationsSortBy: 'date' | 'size' | 'duration' | 'msgs';
  conversationsSortDir: 'asc' | 'desc';

  setActiveTab: (tab: AppTab) => void;
  setSelectedProject: (project: string | null) => void;
  setSelectedCategory: (category: string | null) => void;
  setStatus: (status: MemoryStatus) => void;
  setSelectedMemoryId: (id: string | null) => void;
  setDetailMode: (mode: DetailMode) => void;
  setSearchQuery: (q: string) => void;
  setSearchMode: (m: SearchMode) => void;
  toggleTag: (tag: string) => void;
  clearTags: () => void;
  setDateRange: (r: DateRangePreset) => void;
  setSortBy: (s: SortBy) => void;
  clearFilters: () => void;
  toggleBulkId: (id: string) => void;
  setBulkSelection: (ids: string[]) => void;
  clearBulkSelection: () => void;
  setConversationsProjectId: (id: string | null) => void;
  setConversationsSort: (by: 'date' | 'size' | 'duration' | 'msgs', dir: 'asc' | 'desc') => void;
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
      searchQuery: '',
      searchMode: 'lexical',
      selectedTags: [],
      dateRange: 'all',
      sortBy: 'updatedDesc',
      bulkSelectionIds: [],
      conversationsProjectId: null,
      conversationsSortBy: 'date',
      conversationsSortDir: 'desc',

      setActiveTab: (activeTab) => set({ activeTab }),
      setSelectedProject: (selectedProject) => set({ selectedProject, selectedMemoryId: null }),
      setSelectedCategory: (selectedCategory) => set({ selectedCategory, selectedMemoryId: null }),
      setStatus: (status) => set({ status, selectedMemoryId: null }),
      setSelectedMemoryId: (selectedMemoryId) => set({ selectedMemoryId }),
      setDetailMode: (detailMode) => set({ detailMode }),
      setSearchQuery: (searchQuery) => set({ searchQuery, selectedMemoryId: null }),
      setSearchMode: (searchMode) => set({ searchMode, selectedMemoryId: null }),
      toggleTag: (tag) =>
        set((s) => ({
          selectedTags: s.selectedTags.includes(tag)
            ? s.selectedTags.filter((t) => t !== tag)
            : [...s.selectedTags, tag],
          selectedMemoryId: null,
        })),
      clearTags: () => set({ selectedTags: [], selectedMemoryId: null }),
      setDateRange: (dateRange) => set({ dateRange, selectedMemoryId: null }),
      setSortBy: (sortBy) => set({ sortBy, selectedMemoryId: null }),
      clearFilters: () =>
        set({
          selectedProject: null,
          selectedCategory: null,
          status: 'active',
          searchQuery: '',
          selectedTags: [],
          dateRange: 'all',
          sortBy: 'updatedDesc',
          selectedMemoryId: null,
          bulkSelectionIds: [],
        }),
      toggleBulkId: (id) =>
        set((s) => ({
          bulkSelectionIds: s.bulkSelectionIds.includes(id)
            ? s.bulkSelectionIds.filter((x) => x !== id)
            : [...s.bulkSelectionIds, id],
        })),
      setBulkSelection: (bulkSelectionIds) => set({ bulkSelectionIds }),
      clearBulkSelection: () => set({ bulkSelectionIds: [] }),
      setConversationsProjectId: (conversationsProjectId) => set({ conversationsProjectId }),
      setConversationsSort: (conversationsSortBy, conversationsSortDir) =>
        set({ conversationsSortBy, conversationsSortDir }),
    }),
    {
      name: 'echo-studio.ui',
      partialize: (s) => ({
        activeTab: s.activeTab,
        selectedProject: s.selectedProject,
        selectedCategory: s.selectedCategory,
        status: s.status,
        detailMode: s.detailMode,
        searchMode: s.searchMode,
        sortBy: s.sortBy,
        conversationsProjectId: s.conversationsProjectId,
        conversationsSortBy: s.conversationsSortBy,
        conversationsSortDir: s.conversationsSortDir,
      }),
    },
  ),
);
