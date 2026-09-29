import { invoke } from '@tauri-apps/api/core';
import type {
  ConfigBackup,
  ConversationProject,
  DisplayItem,
  DuplicatePair,
  MemoryHit,
  MemoryListing,
  MemoryProject,
  MemoryRecord,
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

export async function openInClaudeCode(cwd?: string): Promise<string> {
  return invoke<string>('open_in_claude_code', { cwd });
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

export async function setSessionUserTitle(sessionId: string, title: string | null): Promise<void> {
  return invoke<void>('set_session_user_title', { sessionId, title });
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

export async function archiveMemoryRecord(path: string): Promise<{ archivedPath: string }> {
  return invoke<{ archivedPath: string }>('archive_memory_record', { path });
}

export async function restoreMemoryRecord(archivedPath: string): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('restore_memory_record', { archivedPath });
}

export async function moveMemoryRecord(path: string, targetSlug: string): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('move_memory_record', { path, targetSlug });
}

export async function findMemoryDuplicates(slug: string | null): Promise<DuplicatePair[]> {
  return invoke<DuplicatePair[]>('find_memory_duplicates', { slug });
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
