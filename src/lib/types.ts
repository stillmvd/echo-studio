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

export interface MemoriesFilter {
  project?: string;
  category?: string;
  status?: 'active' | 'archived' | 'all';
  limit?: number;
  offset?: number;
}

export interface ProjectCount {
  project: string;
  count: number;
}

export interface CategoryCount {
  category: string | null;
  count: number;
}

export interface MemoriesPage {
  total: number;
  items: Memory[];
  projects: ProjectCount[];
  categories: CategoryCount[];
  memoryHome: string;
  homeSource: string;
}
