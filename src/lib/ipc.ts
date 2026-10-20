import { type Channel, invoke } from '@tauri-apps/api/core';
import type {
  ClaudeSession,
  ConfigBackup,
  ConversationProject,
  DisplayItem,
  DuplicatePair,
  GitState,
  KillResult,
  MemoryHit,
  MemoryListing,
  MemoryProject,
  MemoryRecord,
  ProcessRow,
  ProjectTree,
  RateLimits,
  RecordPatch,
  ScanResult,
  ScopeKind,
  ScopeRef,
  SessionBulkDeleteResult,
  SessionMeta,
  SessionSearchHit,
  ToggleTarget,
  ToolCopy,
  ToolFile,
  ToolItem,
  Usage,
} from './types';

export async function listToolScopes(): Promise<ScopeRef[]> {
  return invoke<ScopeRef[]>('list_tool_scopes');
}

export async function scanToolScope(scope: {
  kind: ScopeKind;
  path: string | null;
}): Promise<ScanResult> {
  return invoke<ScanResult>('scan_tool_scope', { scope });
}

export async function listToolCopies(): Promise<ToolCopy[]> {
  return invoke<ToolCopy[]>('list_tool_copies');
}

export async function readToolFile(path: string): Promise<ToolFile> {
  return invoke<ToolFile>('read_tool_file', { path });
}

export async function setToolEnabled(target: ToggleTarget, enabled: boolean): Promise<ToolItem> {
  return invoke<ToolItem>('set_tool_enabled', { target, enabled });
}

export async function listConfigBackups(): Promise<ConfigBackup[]> {
  return invoke<ConfigBackup[]>('list_config_backups');
}

export async function openInClaudeCode(cwd?: string, sessionId?: string): Promise<string> {
  return invoke<string>('open_in_claude_code', { cwd, sessionId });
}

export async function listConversationProjects(): Promise<ConversationProject[]> {
  return invoke<ConversationProject[]>('list_conversation_projects');
}

export async function listConversationSessions(projectId: string): Promise<SessionMeta[]> {
  return invoke<SessionMeta[]>('list_conversation_sessions', { projectId });
}

export async function readSessionEvents(filePath: string): Promise<DisplayItem[]> {
  return invoke<DisplayItem[]>('read_session_events', { filePath });
}

export async function searchSessionText(
  projectId: string,
  query: string,
): Promise<SessionSearchHit[]> {
  return invoke<SessionSearchHit[]>('search_session_text', { projectId, query });
}

export async function renameSession(filePath: string, title: string): Promise<void> {
  return invoke<void>('rename_session', { filePath, title });
}

export async function deleteConversationSession(filePath: string): Promise<void> {
  return invoke<void>('delete_conversation_session', { filePath });
}

export async function bulkDeleteConversationSessions(
  filePaths: string[],
): Promise<SessionBulkDeleteResult> {
  return invoke<SessionBulkDeleteResult>('bulk_delete_conversation_sessions', { filePaths });
}

export async function revealInExplorer(path: string): Promise<void> {
  return invoke<void>('reveal_in_explorer', { path });
}

export async function listMemoryProjects(): Promise<MemoryProject[]> {
  return invoke<MemoryProject[]>('list_memory_projects');
}

export async function listMemory(slug: string): Promise<MemoryListing> {
  return invoke<MemoryListing>('list_memory', { slug });
}

export async function readMemoryFile(path: string): Promise<{ text: string }> {
  return invoke<{ text: string }>('read_memory_file', { path });
}

export async function searchMemory(query: string, slug: string | null): Promise<MemoryHit[]> {
  return invoke<MemoryHit[]>('search_memory', { query, slug });
}

export async function saveMemoryFile(path: string, text: string): Promise<void> {
  return invoke<void>('save_memory_file', { path, text });
}

export interface ArchivedRecord {
  archivedPath: string;
  indexLine: string | null;
}

export async function archiveMemoryRecord(path: string): Promise<ArchivedRecord> {
  return invoke<ArchivedRecord>('archive_memory_record', { path });
}

export async function restoreMemoryRecord(
  archivedPath: string,
  indexLine: string | null = null,
): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('restore_memory_record', { archivedPath, indexLine });
}

export async function moveMemoryRecord(path: string, targetSlug: string): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('move_memory_record', { path, targetSlug });
}

export async function findMemoryDuplicates(slug: string | null): Promise<DuplicatePair[]> {
  return invoke<DuplicatePair[]>('find_memory_duplicates', { slug });
}

export async function setMemoryDuplicateIgnored(
  slug: string,
  a: string,
  b: string,
  ignored: boolean,
): Promise<void> {
  return invoke<void>('set_memory_duplicate_ignored', { slug, a, b, ignored });
}

export async function patchMemoryRecord(path: string, patch: RecordPatch): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('patch_memory_record', { path, patch });
}

export async function mergeMemoryRecords(
  canonical: string,
  absorbed: string[],
): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('merge_memory_records', { canonical, absorbed });
}

export async function listWorkbenchProjects(): Promise<ProjectTree> {
  return invoke<ProjectTree>('list_workbench_projects');
}

export async function readRateLimits(): Promise<RateLimits | null> {
  return invoke<RateLimits | null>('read_rate_limits');
}

export async function readUsage(): Promise<Record<string, Usage>> {
  return invoke<Record<string, Usage>>('read_usage');
}

export async function readGitStates(paths: string[]): Promise<Record<string, GitState | null>> {
  return invoke<Record<string, GitState | null>>('read_git_states', { paths });
}

export async function listProcesses(): Promise<ProcessRow[]> {
  return invoke<ProcessRow[]>('list_processes');
}

export async function killProcesses(pids: number[], confirmed: boolean): Promise<KillResult> {
  return invoke<KillResult>('kill_processes', { pids, confirmed });
}

export type RawClaudeSession = Omit<ClaudeSession, 'projectPath'>;

export async function listClaudeSessions(): Promise<RawClaudeSession[]> {
  return invoke<RawClaudeSession[]>('list_claude_sessions');
}

export async function setWorkbenchActive(active: boolean): Promise<void> {
  return invoke('set_workbench_active', { active });
}

export async function startClaudeSession(
  projectPath: string,
  resumeSessionId?: string,
): Promise<{ sessionId: string; shortId: string }> {
  return invoke('start_claude_session', { projectPath, resumeSessionId });
}

export async function stopClaudeSession(shortId: string): Promise<void> {
  return invoke('stop_claude_session', { shortId });
}

export async function forgetClaudeSession(shortId: string): Promise<void> {
  return invoke('forget_claude_session', { shortId });
}

export async function terminalAttach(
  shortId: string,
  cols: number,
  rows: number,
  onData: Channel<ArrayBuffer>,
): Promise<string> {
  return invoke<string>('terminal_attach', { shortId, cols, rows, onData });
}

export async function terminalWrite(terminalId: string, data: string): Promise<void> {
  return invoke('terminal_write', { terminalId, data });
}

export async function terminalResize(
  terminalId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke('terminal_resize', { terminalId, cols, rows });
}

export async function terminalDetach(terminalId: string): Promise<void> {
  return invoke('terminal_detach', { terminalId });
}

export async function terminalDetachAll(): Promise<void> {
  return invoke('terminal_detach_all');
}
