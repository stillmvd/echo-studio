import type { ClaudeSession, ProjectTree, SessionStatus, WorkbenchProject } from './types';

export const STATUS_LABEL: Record<SessionStatus, string> = {
  waiting: 'ждёт тебя',
  error: 'ошибка',
  working: 'работает',
  done: 'готово',
  idle: 'простаивает',
  exited: 'завершена',
};

export function all(tree: ProjectTree): WorkbenchProject[] {
  return [...tree.roots, ...tree.groups.flatMap((g) => g.projects)];
}

export function shortPath(path: string): string {
  return path.replace(/^C:\\Users\\[^\\]+\\/i, '~\\');
}

const norm = (p: string) => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

export function samePath(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

export function projectOf(tree: ProjectTree, cwd: string | null): WorkbenchProject | undefined {
  if (!cwd) return undefined;
  const c = norm(cwd);
  return all(tree)
    .filter((p) => {
      const d = norm(p.path);
      return c === d || c.startsWith(`${d}\\`);
    })
    .sort((a, b) => b.path.length - a.path.length)[0];
}

export function withProjects(
  list: Omit<ClaudeSession, 'projectPath'>[],
  tree: ProjectTree | undefined,
): ClaudeSession[] {
  return list.map((s) => ({
    ...s,
    projectPath: tree ? (projectOf(tree, s.cwd)?.path ?? null) : null,
  }));
}

export function effectiveStatus(
  s: Pick<ClaudeSession, 'sessionId' | 'status' | 'since'>,
  seen: Record<string, number>,
): SessionStatus {
  if (s.status === 'done' && (seen[s.sessionId] ?? 0) >= (s.since ?? 0)) return 'idle';
  return s.status;
}

export interface KeyInput {
  type: string;
  key: string;
  code: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export type KeyAction =
  | { send: string }
  | { copy: true }
  | { native: true }
  | { pass: true }
  | null;

export function terminalKey(e: KeyInput, hasSelection: boolean): KeyAction {
  if (e.type !== 'keydown' || e.metaKey) return null;
  if (e.ctrlKey && e.code === 'Tab') return { pass: true };
  if (e.key === 'Enter' && !e.ctrlKey && (e.shiftKey || e.altKey)) return { send: '\x1b\r' };
  if (e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyV') return { send: '\x1bv' };
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyC' && hasSelection) {
    return { copy: true };
  }
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyV') return { native: true };
  return null;
}
