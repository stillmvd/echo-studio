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
}

export function sessionDisplayTitle(s: {
  userTitle: string | null;
  customTitle: string | null;
  aiTitle: string | null;
  sessionId: string;
}): string {
  return (
    s.userTitle?.trim() ||
    s.customTitle?.trim() ||
    s.aiTitle?.trim() ||
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
export type ToolConflict = 'none' | 'overrides' | 'overridden' | 'sameName';

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
  error: string | null;
  frontMatter: Record<string, unknown> | null;
  plugin: PluginInfo | null;
  mcp: McpInfo | null;
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
