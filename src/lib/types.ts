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
  customTitle: string | null;
  aiTitle: string | null;
  userTitle: string | null;
  firstPrompt: string | null;
  firstReply: string | null;
}

export function sessionDisplayTitle(s: {
  userTitle: string | null;
  customTitle: string | null;
  aiTitle: string | null;
  firstPrompt?: string | null;
  sessionId: string;
}): string {
  return (
    s.userTitle?.trim() ||
    s.customTitle?.trim() ||
    s.aiTitle?.trim() ||
    s.firstPrompt?.trim() ||
    `${s.sessionId.slice(0, 8)}…`
  );
}

export interface DisplayItem {
  uuid: string;
  parentUuid: string | null;
  timestamp: string | null;
  kind: string;
  role: string;
  text: string | null;
  toolName: string | null;
  toolInputSummary: string | null;
  toolInputJson: unknown;
  isError: boolean | null;
  raw: unknown;
}

export interface SessionSearchHit {
  sessionId: string;
  filePath: string;
  uuid: string;
  timestamp: string | null;
  kind: string;
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

export type ScopeKind = 'global' | 'project';
export type ToolKind = 'skill' | 'command' | 'agent' | 'plugin' | 'mcp';
export type ToolOrigin = 'user' | 'project' | 'local' | 'plugin';
export type ToolState = 'enabled' | 'disabled' | 'unavailable' | 'error';
export type ToolConflict = 'none' | 'overrides' | 'overridden';

export interface ScopeRef {
  kind: ScopeKind;
  path: string | null;
  name: string;
  available: boolean;
}

export interface ToggleTarget {
  file: 'userSettings' | 'projectLocalSettings' | 'claudeJson';
  projectPath: string | null;
  key: 'enabledPlugins' | 'skillOverrides' | 'disabledMcpServers' | 'disabledMcpjsonServers';
  name: string;
}

export interface PluginInfo {
  version: string | null;
  marketplace: string;
  installedAt: string | null;
  lastUpdated: string | null;
  installPath: string;
  contents: { skills: number; commands: number; agents: number; mcp: number; hooks: number };
}

export interface McpInfo {
  transport: string;
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  headers: Record<string, string>;
  declaredIn: string;
}

export interface ToolItem {
  id: string;
  kind: ToolKind;
  name: string;
  qualifiedName: string;
  description: string | null;
  origin: ToolOrigin;
  pluginKey: string | null;
  filePath: string | null;
  state: ToolState;
  overrideMode: string | null;
  toggle: ToggleTarget | null;
  toggleHint: string | null;
  conflict: ToolConflict;
  overriddenBy: string | null;
  overrides: string[];
  error: string | null;
  frontMatter: Record<string, unknown> | null;
  plugin: PluginInfo | null;
  mcp: McpInfo | null;
}

export interface ToolCopy {
  kind: 'skill' | 'command' | 'agent';
  name: string;
  scope: { kind: 'global' | 'project' | 'plugin'; path: string | null; label: string };
  filePath: string;
  hash: string | null;
  modifiedMs: number | null;
}

export interface SourceStatus {
  path: string;
  status: 'ok' | 'missing' | 'error';
  error: string | null;
}

export interface ScanResult {
  scope: ScopeRef;
  items: ToolItem[];
  sources: SourceStatus[];
  counts: Partial<Record<ToolKind, number>>;
}

export interface ToolFile {
  text: string;
  truncatedAt: number | null;
}

export interface ConfigBackup {
  file: string;
  backupPath: string;
  createdAt: string;
  sizeBytes: number;
}

export interface MemoryProject {
  slug: string;
  name: string;
  cwd: string | null;
  memoryDir: string;
  records: number;
  facts: number;
  sessions: number;
  archived: number;
  indexLines: number;
  updatedAt: number;
}

export type MemoryKind = 'decision' | 'gotcha' | 'bugfix' | 'feature' | 'discovery';

export interface MemoryRecord {
  path: string;
  file: string;
  name: string;
  description: string;
  type: string | null;
  kind: string | null;
  status: 'observation' | 'fact';
  seen: number;
  importance: 1 | 2 | 3;
  tags: string[];
  files: string[];
  supersedes: string | null;
  validTo: string | null;
  consolidatedInto: string | null;
  stale: boolean;
  updated: string;
  archived: boolean;
  bodyChars: number;
  error: string | null;
}

export interface SessionNote {
  path: string;
  sessionId: string | null;
  title: string;
  capture: 'claude' | 'extractive';
  updated: string;
  next: string | null;
  error: string | null;
}

export interface MemoryListing {
  records: MemoryRecord[];
  sessions: SessionNote[];
  archived: MemoryRecord[];
  indexLines: number;
}

export interface MemoryHit {
  slug: string;
  path: string;
  line: number;
  snippet: string;
}

export interface DuplicatePair {
  slug: string;
  a: MemoryRecord;
  b: MemoryRecord;
  score: number;
}

export interface RecordPatch {
  status?: 'observation' | 'fact';
  importance?: 1 | 2 | 3;
  validTo?: string | null;
  supersedes?: string | null;
}

export type DevKind = 'tauri' | 'web';

export interface WorkbenchProject {
  path: string;
  name: string;
  group: string | null;
  icon: string | null;
  dev: { command: string; kind: DevKind } | null;
  mcp: { profile: string | null; headless: boolean } | null;
  hasClaudeMd: boolean;
}

export interface WorkbenchGroup {
  name: string;
  icon: string | null;
  projects: WorkbenchProject[];
}

export interface ProjectTree {
  groups: WorkbenchGroup[];
  roots: WorkbenchProject[];
}

export type SessionStatus = 'waiting' | 'error' | 'working' | 'done' | 'idle' | 'exited';

export interface ClaudeSession {
  sessionId: string;
  shortId: string | null;
  kind: 'shell' | 'external';
  projectPath: string | null;
  cwd: string | null;
  name: string | null;
  status: SessionStatus;
  phase: 'thinking' | 'tool' | 'agents' | null;
  tool: string | null;
  since: number | null;
  pid: number | null;
  transcript: string | null;
}

export interface Limit {
  usedPercentage: number;
  resetsAt: number;
  reset: boolean;
}

export interface RateLimits {
  fiveHour: Limit | null;
  sevenDay: Limit | null;
  updatedAt: number;
}

export interface Usage {
  week: number;
  today: number;
  sessions: number;
  days: Record<string, number>;
}

export interface GitStatus {
  branch: string;
  dirty: number;
  ahead: number;
  behind: number;
  upstream: boolean;
}

export type GitState = GitStatus | { error: string };

export type OrphanReason = 'session-closed' | 'duplicate' | 'no-project';

export interface Orphan {
  reason: OrphanReason;
  since?: number;
  of?: number;
}

export type ProcessGuard = 'live-session' | 'running-dev';

export interface ProcessRow {
  pid: number;
  startTime: number;
  name: string;
  memory: number;
  commandLine: string;
  projectPath: string | null;
  session: string | null;
  orphan: Orphan | null;
  guard: ProcessGuard | null;
}

export interface KillTarget {
  pid: number;
  startTime: number;
}

export interface KillResult {
  killed: number[];
  failed: { pid: number; error: string }[];
}

export type DevState = 'starting' | 'running' | 'stopped' | 'error';

export interface DevServer {
  projectPath: string;
  command: string;
  state: DevState;
  ports: number[];
  startedAt: number;
  exitCode: number | null;
  log: string;
}
