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

export interface ConversationProject {
  id: string;
  cwd: string;
  displayName: string;
  sessionCount: number;
  totalSize: number;
  lastActivity: string | null;
}

export interface SessionMeta {
  sessionId: string;
  filePath: string;
  sizeBytes: number;
  messageCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  durationMs: number;
  gitBranch: string | null;
  cwd: string | null;
}

export interface SessionEvent {
  uuid: string;
  parentUuid: string | null;
  timestamp: string | null;
  eventType: string;
  subtype: string | null;
  role: string | null;
  summary: string;
  raw: unknown;
}

export interface SessionSearchHit {
  sessionId: string;
  filePath: string;
  uuid: string;
  timestamp: string | null;
  eventType: string;
  preview: string;
}

export interface SessionDeleteFailure {
  path: string;
  error: string;
}

export interface SessionBulkDeleteResult {
  deleted: string[];
  failed: SessionDeleteFailure[];
}

export interface BackupInfo {
  path: string;
  createdAt: string;
  sizeBytes: number;
}
