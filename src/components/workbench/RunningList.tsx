import { cn } from '@/lib/cn';
import type { ClaudeSession, WorkbenchProject } from '@/lib/types';
import { byUrgency, effectiveStatus, STATUS_LABEL } from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { StatusIcon } from './StatusIcon';

interface Props {
  sessions: ClaudeSession[];
  projects: Map<string, WorkbenchProject>;
}

export function RunningList({ sessions, projects }: Props) {
  const seen = useWorkbenchStore((s) => s.seen);
  const view = useWorkbenchStore((s) => s.view);
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const openTab = useWorkbenchStore((s) => s.openTab);
  const select = useWorkbenchStore((s) => s.select);

  if (sessions.length === 0) return <p className="wb-runs-empty">Ничего не запущено</p>;

  return (
    <div className="wb-runs">
      {byUrgency(sessions, seen).map((s) => {
        const status = effectiveStatus(s, seen);
        const project = s.projectPath ? projects.get(s.projectPath) : undefined;
        const on =
          view.kind === 'project' &&
          view.path === s.projectPath &&
          activeTab[s.projectPath ?? ''] === s.sessionId;
        const where = project?.name ?? s.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? 'без папки';
        const sub = [where, STATUS_LABEL[status], s.kind === 'external' && 'вне оболочки']
          .filter(Boolean)
          .join(' · ');
        return (
          <button
            key={s.sessionId}
            type="button"
            className={cn('wb-run', on && 'on')}
            title={s.cwd ?? undefined}
            onClick={() => {
              if (!s.projectPath) return;
              if (s.kind === 'shell') openTab(s.projectPath, s.sessionId);
              select({ kind: 'project', path: s.projectPath });
            }}
          >
            <StatusIcon session={{ status, phase: s.phase, tool: s.tool }} />
            <span className="wb-tn">
              <b>{s.name || 'Claude'}</b>
              <span>{sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
