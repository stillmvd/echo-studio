import { invoke } from '@tauri-apps/api/core';
import type {
  BackupInfo,
  BulkResult,
  ConversationProject,
  MemoriesFilter,
  MemoriesPage,
  MemoryPatch,
  MemoryWithBody,
  SessionEvent,
  SessionMeta,
  SessionSearchHit,
} from './types';

export async function listMemories(filter: MemoriesFilter = {}): Promise<MemoriesPage> {
  return invoke<MemoriesPage>('list_memories', { filter });
}

export async function getMemory(id: string): Promise<MemoryWithBody | null> {
  return invoke<MemoryWithBody | null>('get_memory', { id });
}

export async function archiveMemory(id: string, reason?: string): Promise<boolean> {
  return invoke<boolean>('archive_memory', { id, reason });
}

export async function restoreMemory(id: string): Promise<boolean> {
  return invoke<boolean>('restore_memory', { id });
}

export async function deleteMemory(id: string): Promise<boolean> {
  return invoke<boolean>('delete_memory', { id });
}

export async function bulkArchiveMemories(ids: string[], reason?: string): Promise<BulkResult> {
  return invoke<BulkResult>('bulk_archive_memories', { ids, reason });
}

export async function bulkRestoreMemories(ids: string[]): Promise<BulkResult> {
  return invoke<BulkResult>('bulk_restore_memories', { ids });
}

export async function bulkDeleteMemories(ids: string[]): Promise<BulkResult> {
  return invoke<BulkResult>('bulk_delete_memories', { ids });
}

export async function listDbBackups(): Promise<BackupInfo[]> {
  return invoke<BackupInfo[]>('list_db_backups');
}

export async function manualBackup(): Promise<string> {
  return invoke<string>('manual_backup');
}

export async function updateMemory(id: string, patch: MemoryPatch): Promise<boolean> {
  return invoke<boolean>('update_memory', { id, patch });
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

export async function readSessionEvents(filePath: string): Promise<SessionEvent[]> {
  return invoke<SessionEvent[]>('read_session_events', { filePath });
}

export async function searchSessionText(
  projectId: string,
  query: string,
): Promise<SessionSearchHit[]> {
  return invoke<SessionSearchHit[]>('search_session_text', { projectId, query });
}
