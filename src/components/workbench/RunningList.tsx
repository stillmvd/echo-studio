import { SquareTerminal } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useOpenMenu } from '@/components/ui/ContextMenu';
import { cn } from '@/lib/cn';
import { devLook, LIVE_COLOR, type LiveLook, sessionLook } from '@/lib/live-status';
import type { ClaudeSession, DevServer, WorkbenchProject } from '@/lib/types';
import {
  agentName,
  CELL_COUNT,
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
import { tabDragProps } from './useTabDrag';

interface Props {
  sessions: ClaudeSession[];
  devServers: DevServer[];
  projects: Map<string, WorkbenchProject>;
  busy: boolean;
  onStart: (path: string) => void;
}

const folderName = (path: string | null | undefined) => path?.split(/[\\/]/).filter(Boolean).pop();

const ROOT_HINT = 'Сессии вне папки Projects';
const RUNNING_CELL = 'running';

function showInWall(s: ClaudeSession) {
  if (!s.projectPath) return;
  const st = useWorkbenchStore.getState();
  const shown = st.cells.slice(0, CELL_COUNT[st.layout]);
  const holder = shown.find((c) => c.activeTab === s.sessionId);
  if (holder) useWorkbenchStore.setState({ focusCell: holder.id });
  else {
    const target =
      shown.find((c) => c.id === st.focusCell) ?? shown.find((c) => !c.projectPath) ?? shown[0];
    if (!target) return;
    st.moveTabToWallCell(target.id, s.projectPath, s.sessionId);
  }
  focusSoon(s.sessionId);
}

export function RunningList({ sessions, devServers, projects, busy, onStart }: Props) {
  const auto = useWorkbenchStore((s) => s.auto);
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

  const toWall = (s: ClaudeSession) => auto && s.kind === 'shell' && !!s.projectPath;

  const goSession = (s: ClaudeSession, anchor: HTMLElement) => {
    if (s.kind === 'external') {
      void openExternal(s, anchor);
      return;
    }
    if (toWall(s)) showInWall(s);
    else openSession(s);
  };

  const tileStyle = (look: LiveLook) => ({ '--c': LIVE_COLOR[look] }) as CSSProperties;

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
        style={tileStyle(look)}
        onClick={go}
        onContextMenu={(e) =>
          openMenu(
            e,
            runningDevMenu({
              server: d,
              actions: {
                go,
                openBrowser: () => dev.openBrowser(d.projectPath),
                restart: () => restartDev(dev, project, d),
                copyUrl: () => url && copyText(url),
                stop: () => dev.askStop(project),
                dismiss: () => dev.dismiss(d.projectPath),
              },
            }),
          )
        }
      >
        <LiveIcon look={look} />
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
        style={tileStyle(look)}
        disabled={!external && !s.projectPath}
        {...(toWall(s) && s.projectPath
          ? tabDragProps({ path: s.projectPath, key: s.sessionId, cell: RUNNING_CELL })
          : {})}
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
        <LiveIcon look={look} dim={external ? status === 'exited' : !s.projectPath} />
        {external && <SquareTerminal className="wb-rt-term" strokeWidth={2} aria-hidden="true" />}
        <span className="wb-rt-l">
          <span>{s.name || (external ? folderName(s.cwd) : null) || agentName(s)}</span>
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
        return (
          <article key={g.path ?? ''} className="wb-pc">
            {project ? (
              <button
                type="button"
                className="wb-pc-h"
                onClick={() => select({ kind: 'project', path: project.path })}
                onContextMenu={(e) => projectMenu(e, project)}
              >
                {name}
              </button>
            ) : (
              <div className="wb-pc-h" data-tip={g.path ? undefined : ROOT_HINT}>
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
