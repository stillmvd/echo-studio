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
