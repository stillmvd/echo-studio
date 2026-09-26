import { invoke } from '@tauri-apps/api/core';
import type {
  ConversationProject,
  DisplayItem,
  ScanResult,
  ScopeKind,
  ScopeRef,
  SessionBulkDeleteResult,
  SessionMeta,
  SessionSearchHit,
  ToolFile,
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

export async function readToolFile(path: string): Promise<ToolFile> {
  return invoke<ToolFile>('read_tool_file', { path });
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
