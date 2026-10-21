import { useOpenMenu } from '@/components/ui/ContextMenu';
import { cn } from '@/lib/cn';
import type { ClaudeSession, DevServer, WorkbenchProject } from '@/lib/types';
import {
  EXTERNAL_LABEL,
  type RunningItem,
  runningGroups,
  STATUS_LABEL,
  statusTitle,
  statusView,
} from '@/lib/workbench';
import { devTabKey, useWorkbenchStore } from '@/state/workbench-store';
import { useStopSession } from './Cell';
import { DevDot } from './DevCapsule';
import { externalTitle, useExternalSession } from './externalSession';
import { canStopSession, copyText, devUrl, runningDevMenu, runningMenu } from './menus';
import { ProjectIcon } from './ProjectIcon';
import { useProjectMenu } from './ProjectTree';
import { StatusIcon } from './StatusIcon';

interface Props {
  sessions: ClaudeSession[];
  devServers: DevServer[];
  projects: Map<string, WorkbenchProject>;
  busy: boolean;
  onStart: (path: string) => void;
}

const folderName = (path: string | null | undefined) => path?.split(/[\\/]/).filter(Boolean).pop();

const DEV_LABEL = {
  starting: 'dev запускается',
  error: 'dev · ошибка',
  running: 'dev работает',
  stopped: 'dev остановлен',
} as const;

const ROOT_HINT = 'Сессии в корне Projects и в папках вне списка проектов';

export function RunningList({ sessions, devServers, projects, busy, onStart }: Props) {
  const seen = useWorkbenchStore((s) => s.seen);
  const view = useWorkbenchStore((s) => s.view);
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const openTab = useWorkbenchStore((s) => s.openTab);
  const select = useWorkbenchStore((s) => s.select);
  const { openExternal, layer } = useExternalSession();
  const openMenu = useOpenMenu();
  const { menu: projectMenu, dev } = useProjectMenu(devServers, busy, onStart);
  const stop = useStopSession();

  const groups = runningGroups(sessions, devServers, seen);
  if (groups.length === 0) {
    return (
      <>
        <p className="wb-runs-empty">Ничего не запущено</p>
        {layer}
      </>
    );
  }

  const isOn = (path: string | null, key: string) =>
    view.kind === 'project' && view.path === path && activeTab[path ?? ''] === key;

  const goSession = (s: ClaudeSession, anchor: HTMLElement) => {
    if (s.kind === 'external') {
      void openExternal(s, anchor);
      return;
    }
    if (!s.projectPath) return;
    openTab(s.projectPath, s.sessionId);
    select({ kind: 'project', path: s.projectPath });
  };

  const topLabel = (item: RunningItem) =>
    item.kind === 'dev'
      ? DEV_LABEL[item.server.state]
      : STATUS_LABEL[statusView(item.session, seen)];

  const devRow = (d: DevServer) => {
    const key = devTabKey(d.projectPath);
    const ports = d.ports.map((p) => `:${p}`).join(' ');
    const go = () => {
      openTab(d.projectPath, key);
      select({ kind: 'project', path: d.projectPath });
    };
    const url = devUrl(d);
    return (
      <button
        key={key}
        type="button"
        className={cn('wb-run', isOn(d.projectPath, key) && 'on')}
        title={`${DEV_LABEL[d.state]} — ${d.command}`}
        onClick={go}
        onContextMenu={(e) =>
          openMenu(
            e,
            runningDevMenu({
              server: d,
              actions: {
                go,
                copyUrl: () => url && copyText(url),
                stop: () => dev.askStop({ path: d.projectPath, dev: { command: d.command } }),
              },
            }),
          )
        }
      >
        <DevDot server={d} />
        <span className="wb-run-n">{d.command}</span>
        <span className="wb-run-s">
          {d.state === 'running' ? ports || 'без порта' : DEV_LABEL[d.state]}
        </span>
      </button>
    );
  };

  const sessionRow = (s: ClaudeSession) => {
    const status = statusView(s, seen);
    const external = s.kind === 'external';
    const label = [STATUS_LABEL[status], external && EXTERNAL_LABEL].filter(Boolean).join(' · ');
    return (
      <button
        key={s.sessionId}
        type="button"
        className={cn(
          'wb-run',
          isOn(s.projectPath, s.sessionId) && 'on',
          external && status === 'exited' && 'ext',
        )}
        title={[
          statusTitle(status, external),
          external
            ? externalTitle(s)
            : !s.projectPath && `${s.cwd ?? 'Папка неизвестна'} — не проект из списка`,
        ]
          .filter(Boolean)
          .join('\n')}
        disabled={!external && !s.projectPath}
        onClick={(e) => goSession(s, e.currentTarget)}
        onContextMenu={(e) => {
          if (!external && !s.projectPath) return;
          const anchor = e.currentTarget;
          openMenu(
            e,
            runningMenu({
              external,
              canStop: canStopSession(s),
              actions: {
                go: () => goSession(s, anchor),
                copyId: () => copyText(s.sessionId),
                stop: () => stop.ask(s.shortId),
              },
            }),
          );
        }}
      >
        <StatusIcon small session={{ status, phase: s.phase, tool: s.tool }} />
        <span className="wb-run-n">
          {s.name || (external ? folderName(s.cwd) : null) || 'Claude'}
        </span>
        <span className="wb-run-s">{label}</span>
      </button>
    );
  };

  return (
    <div className="wb-runs">
      {groups.map((g) => {
        const project = g.path ? projects.get(g.path) : undefined;
        const head = (
          <>
            <ProjectIcon svg={project?.icon ?? null} />
            <b className="wb-run-n">
              {project?.name ?? (g.path ? folderName(g.path) : 'Projects')}
            </b>
            <span className="wb-run-s">{topLabel(g.top)}</span>
          </>
        );
        return (
          <div key={g.path ?? ''} className="wb-rg">
            {project ? (
              <button
                type="button"
                className="wb-run head"
                title={project.path}
                onClick={() => select({ kind: 'project', path: project.path })}
                onContextMenu={(e) => projectMenu(e, project)}
              >
                {head}
              </button>
            ) : (
              <div className="wb-run head" title={g.path ?? ROOT_HINT}>
                {head}
              </div>
            )}
            {g.sessions.map(sessionRow)}
            {g.devs.map(devRow)}
          </div>
        );
      })}
      {layer}
      {dev.dialogs}
      {stop.dialog}
    </div>
  );
}
