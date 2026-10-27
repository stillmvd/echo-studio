import type { ClaudeSession, WorkbenchProject } from '@/lib/types';
import { useWorkbenchStore } from '@/state/workbench-store';
import { focusSoon } from './terminals';

export function openSession(s: ClaudeSession) {
  if (!s.projectPath) return;
  const { openTab, select } = useWorkbenchStore.getState();
  if (s.kind === 'shell') openTab(s.projectPath, s.sessionId);
  select({ kind: 'project', path: s.projectPath });
  focusSoon(s.sessionId);
}

export function sessionPlace(s: ClaudeSession, projects: Map<string, WorkbenchProject>): string {
  const project = s.projectPath ? projects.get(s.projectPath) : undefined;
  return project?.name ?? s.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? 'без папки';
}
