import { useOpenMenu } from '@/components/ui/ContextMenu';
import { cn } from '@/lib/cn';
import type { ClaudeSession, WorkbenchProject } from '@/lib/types';
import { recentSessions, statusTitle, statusView } from '@/lib/workbench';
import { useRecentStore } from '@/state/recent-store';
import { useWorkbenchStore } from '@/state/workbench-store';
import { useStopSession } from './Cell';
import { canStopSession, copyText, runningMenu } from './menus';
import { StatusIcon } from './StatusIcon';
import { focusSoon } from './terminals';

interface Props {
  sessions: ClaudeSession[];
  projects: Map<string, WorkbenchProject>;
}

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

export function SessionStrip({ sessions, projects }: Props) {
  const seen = useWorkbenchStore((s) => s.seen);
  const view = useWorkbenchStore((s) => s.view);
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const history = useRecentStore((s) => s.history);
  const openMenu = useOpenMenu();
  const stop = useStopSession();
  const recent = recentSessions(history, sessions);

  return (
    <div className="wb-foot">
      <div className="wb-bar2" role="toolbar" aria-label="Недавние сессии">
        <span className="wb-bar-lbl">Недавние</span>
        <div
          className="wb-bar-list"
          onWheel={(e) => {
            if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY;
          }}
        >
          {recent.length === 0 && (
            <span className="wb-bar-lbl">Здесь появятся сессии, которые ты открывал</span>
          )}
          {recent.map((s) => {
            const status = statusView(s, seen);
            const on =
              view.kind === 'project' &&
              view.path === s.projectPath &&
              activeTab[s.projectPath ?? ''] === s.sessionId;
            return (
              <button
                key={s.sessionId}
                type="button"
                className={cn('wb-bp', on && 'on')}
                title={`${s.name || 'Claude'}\n${statusTitle(status)}`}
                onClick={() => openSession(s)}
                onContextMenu={(e) =>
                  openMenu(
                    e,
                    runningMenu({
                      external: false,
                      canStop: canStopSession(s),
                      actions: {
                        go: () => openSession(s),
                        copyId: () => copyText(s.sessionId),
                        stop: () => stop.ask(s.shortId),
                      },
                    }),
                  )
                }
              >
                <StatusIcon small session={{ status, phase: s.phase, tool: s.tool }} />
                <b>{sessionPlace(s, projects)}</b>
                <span className="wb-dim">{s.name || 'Claude'}</span>
              </button>
            );
          })}
        </div>
        {stop.dialog}
        <span className="wb-kbd">Ctrl</span>
        <span className="wb-kbd">Tab</span>
      </div>
      <div className="wb-watching" role="status" title="Watching Claude config for changes">
        <i />
        watching
      </div>
    </div>
  );
}
