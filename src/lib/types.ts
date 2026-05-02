export interface Memory {
  id: string;
  title: string;
  what: string;
  why: string | null;
  impact: string | null;
  tags: string[];
  category: string | null;
  project: string;
  source: string | null;
  relatedFiles: string[];
  filePath: string;
  sectionAnchor: string | null;
  createdAt: string;
  updatedAt: string;
  status: string;
  archivedAt: string | null;
  archiveReason: string | null;
  supersededBy: string | null;
  updatedCount: number;
}

export interface MemoryWithBody extends Memory {
  body: string | null;
  sizeBytes: number;
}

export type SearchMode = 'lexical' | 'semantic' | 'hybrid';
export type SortBy = 'updatedDesc' | 'createdDesc' | 'titleAsc' | 'projectAsc';

export interface MemoriesFilter {
  project?: string;
  category?: string;
  status?: 'active' | 'archived' | 'all';
  limit?: number;
  offset?: number;
  query?: string;
  mode?: SearchMode;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: SortBy;
}

export interface ProjectCount {
  project: string;
  count: number;
}

export interface CategoryCount {
  category: string | null;
  count: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface MemoriesPage {
  total: number;
  items: Memory[];
  projects: ProjectCount[];
  categories: CategoryCount[];
  tags: TagCount[];
  memoryHome: string;
  homeSource: string;
  modeUsed: SearchMode | null;
  semanticWarning: string | null;
}

export interface BulkFailure {
  id: string;
  error: string;
}

export interface BulkResult {
  succeeded: string[];
  failed: BulkFailure[];
  backupPath: string | null;
}

export interface MemoryPatch {
  title?: string;
  what?: string;
  why?: string | null;
  impact?: string | null;
  category?: string | null;
  tags?: string[];
  body?: string | null;
}

export interface BackupInfo {
  path: string;
  createdAt: string;
  sizeBytes: number;
}
