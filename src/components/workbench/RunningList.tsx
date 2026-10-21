import { useOpenMenu } from '@/components/ui/ContextMenu';
import { cn } from '@/lib/cn';
import type { ClaudeSession, DevServer, WorkbenchProject } from '@/lib/types';
import { effectiveStatus, runningItems, STATUS_LABEL } from '@/lib/workbench';
import { devTabKey, useWorkbenchStore } from '@/state/workbench-store';
import { useStopSession } from './Cell';
import { DevDot, useDevControl } from './DevCapsule';
import { externalTitle, useExternalSession } from './externalSession';
import { canStopSession, copyText, devUrl, runningDevMenu, runningMenu } from './menus';
import { StatusIcon } from './StatusIcon';

interface Props {
  sessions: ClaudeSession[];
  devServers: DevServer[];
  projects: Map<string, WorkbenchProject>;
}

const folderName = (path: string | null | undefined) => path?.split(/[\\/]/).filter(Boolean).pop();

const DEV_SUB = { starting: 'запускается', error: 'ошибка', running: '', stopped: '' } as const;

export function RunningList({ sessions, devServers, projects }: Props) {
  const seen = useWorkbenchStore((s) => s.seen);
  const view = useWorkbenchStore((s) => s.view);
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const openTab = useWorkbenchStore((s) => s.openTab);
  const select = useWorkbenchStore((s) => s.select);
  const { openExternal, layer } = useExternalSession();
  const openMenu = useOpenMenu();
  const dev = useDevControl();
  const stop = useStopSession();

  const items = runningItems(sessions, devServers, seen);
  if (items.length === 0) {
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

  return (
    <div className="wb-runs">
      {items.map((item) => {
        if (item.kind === 'dev') {
          const d = item.server;
          const key = devTabKey(d.projectPath);
          const ports = d.ports.map((p) => `:${p}`).join(' ');
          const sub = [d.command, DEV_SUB[d.state] || ports || 'без порта'].join(' · ');
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
              title={d.projectPath}
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
              <span className="wb-tn">
                <b>{projects.get(d.projectPath)?.name ?? folderName(d.projectPath) ?? 'dev'}</b>
                <span>{sub}</span>
              </span>
            </button>
          );
        }
        const s = item.session;
        const status = effectiveStatus(s, seen);
        const project = s.projectPath ? projects.get(s.projectPath) : undefined;
        const where = project?.name ?? folderName(s.cwd) ?? 'без папки';
        const sub = [where, STATUS_LABEL[status], s.kind === 'external' && 'вне оболочки']
          .filter(Boolean)
          .join(' · ');
        const external = s.kind === 'external';
        return (
          <button
            key={s.sessionId}
            type="button"
            className={cn(
              'wb-run',
              isOn(s.projectPath, s.sessionId) && 'on',
              external && status === 'exited' && 'ext',
            )}
            title={
              (external && externalTitle(s)) ||
              (s.projectPath
                ? (s.cwd ?? undefined)
                : `${s.cwd ?? 'Папка неизвестна'} — не проект из списка`)
            }
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
            <StatusIcon session={{ status, phase: s.phase, tool: s.tool }} />
            <span className="wb-tn">
              <b>{s.name || 'Claude'}</b>
              <span>{sub}</span>
            </span>
          </button>
        );
      })}
      {layer}
      {dev.dialogs}
      {stop.dialog}
    </div>
  );
}
