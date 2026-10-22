import { SquareTerminal } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useOpenMenu } from '@/components/ui/ContextMenu';
import { cn } from '@/lib/cn';
import {
  cardGlow,
  devLook,
  LIVE_COLOR,
  type LiveLook,
  sessionLook,
  sweepDelay,
} from '@/lib/live-status';
import type { ClaudeSession, DevServer, WorkbenchProject } from '@/lib/types';
import {
  devStatusLabel,
  EXTERNAL_LABEL,
  runningGroups,
  STATUS_LABEL,
  statusView,
} from '@/lib/workbench';
import { devTabKey, useWorkbenchStore } from '@/state/workbench-store';
import { useStopSession } from './Cell';
import { restartDev } from './DevCapsule';
import { useExternalSession } from './externalSession';
import { LiveIcon } from './live/LiveIcon';
import { canStopSession, copyText, devUrl, runningDevMenu, runningMenu } from './menus';
import { useProjectMenu } from './ProjectTree';
import { openSession } from './SessionStrip';
import { focusSoon } from './terminals';

interface Props {
  sessions: ClaudeSession[];
  devServers: DevServer[];
  projects: Map<string, WorkbenchProject>;
  busy: boolean;
  onStart: (path: string) => void;
}

const folderName = (path: string | null | undefined) => path?.split(/[\\/]/).filter(Boolean).pop();

const ROOT_HINT = 'Сессии вне папки Projects';

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
    openSession(s);
  };

  const tileStyle = (look: LiveLook, key: string) =>
    ({
      '--c': LIVE_COLOR[look],
      '--dl': `-${sweepDelay(key)}s`,
      ...(look === 'waiting' && { '--spd': '3s' }),
    }) as CSSProperties;

  const devTile = (d: DevServer) => {
    const key = devTabKey(d.projectPath);
    const project = { path: d.projectPath, dev: { command: d.command } };
    const go = () => {
      openTab(d.projectPath, key);
      select({ kind: 'project', path: d.projectPath });
      focusSoon(key);
    };
    const url = devUrl(d);
    const look = devLook(d);
    return (
      <button
        key={key}
        type="button"
        className={cn('wb-rt', isOn(d.projectPath, key) && 'on')}
        style={tileStyle(look, key)}
        onClick={go}
        onContextMenu={(e) =>
          openMenu(
            e,
            runningDevMenu({
              server: d,
              actions: {
                go,
                restart: () => restartDev(dev, project, d),
                copyUrl: () => url && copyText(url),
                stop: () => dev.askStop(project),
              },
            }),
          )
        }
      >
        <LiveIcon look={look} seed={key} />
        <span className="wb-rt-l">
          <span>{d.command}</span>
          <small>{devStatusLabel(d)}</small>
        </span>
      </button>
    );
  };

  const sessionTile = (s: ClaudeSession) => {
    const status = statusView(s, seen);
    const external = s.kind === 'external';
    const label = [STATUS_LABEL[status], external && EXTERNAL_LABEL].filter(Boolean).join(' · ');
    const look = sessionLook({ status, phase: s.phase });
    return (
      <button
        key={s.sessionId}
        type="button"
        className={cn(
          'wb-rt',
          isOn(s.projectPath, s.sessionId) && 'on',
          external && status === 'exited' && 'ext',
        )}
        style={tileStyle(look, s.sessionId)}
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
        <LiveIcon
          look={look}
          dim={external ? status === 'exited' : !s.projectPath}
          seed={s.sessionId}
        />
        {external && <SquareTerminal className="wb-rt-term" strokeWidth={2} aria-hidden="true" />}
        <span className="wb-rt-l">
          <span>{s.name || (external ? folderName(s.cwd) : null) || 'Claude'}</span>
          <small>{label}</small>
        </span>
      </button>
    );
  };

  return (
    <div className="wb-runs">
      {groups.map((g) => {
        const project = g.path ? projects.get(g.path) : undefined;
        const name = project?.name ?? (g.path ? folderName(g.path) : 'Projects');
        const looks = [
          ...g.sessions.map((s) => sessionLook({ status: statusView(s, seen), phase: s.phase })),
          ...g.devs.map(devLook),
        ];
        return (
          <article
            key={g.path ?? ''}
            className="wb-pc"
            style={{ '--card-bg': cardGlow(looks.map((l) => LIVE_COLOR[l])) } as CSSProperties}
          >
            {project ? (
              <button
                type="button"
                className="wb-pc-h"
                title={project.path}
                onClick={() => select({ kind: 'project', path: project.path })}
                onContextMenu={(e) => projectMenu(e, project)}
              >
                {name}
              </button>
            ) : (
              <div className="wb-pc-h" title={g.path ?? ROOT_HINT}>
                {name}
              </div>
            )}
            <div className="wb-rts">
              {g.sessions.map(sessionTile)}
              {g.devs.map(devTile)}
            </div>
          </article>
        );
      })}
      {layer}
      {dev.dialogs}
      {stop.dialog}
    </div>
  );
}
