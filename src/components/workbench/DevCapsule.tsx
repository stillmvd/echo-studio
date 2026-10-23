import { useQueryClient } from '@tanstack/react-query';
import { Globe, Play, RotateCcw, Square } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useOpenMenu } from '@/components/ui/ContextMenu';
import { openDevServer, startDevServer, stopDevServer } from '@/lib/ipc';
import { devLook } from '@/lib/live-status';
import type { DevServer, WorkbenchProject } from '@/lib/types';
import { devHealth, devStatusLabel } from '@/lib/workbench';
import { devTabKey, useWorkbenchStore } from '@/state/workbench-store';
import { LiveIcon } from './live/LiveIcon';
import { copyText, devRuns, devTabMenu, devUrl } from './menus';
import { dispose, focusSoon, startTail } from './terminals';

export function closeDevLog(path: string) {
  const key = devTabKey(path);
  dispose(key);
  useWorkbenchStore.getState().closeTab(path, key);
}

export function devActions(
  dev: ReturnType<typeof useDevControl>,
  project: WorkbenchProject,
  server: DevServer | undefined,
) {
  const url = devUrl(server);
  return {
    openBrowser: () => dev.openBrowser(project.path),
    restart: () => (devRuns(server) ? dev.askStop(project, true) : dev.start(project.path)),
    copyUrl: () => url && copyText(url),
    closeLog: () => closeDevLog(project.path),
    stop: () => dev.askStop(project),
  };
}

export function devState(server: DevServer | undefined) {
  return server?.state ?? 'stopped';
}

export function DevDot({ server }: { server: DevServer | undefined }) {
  return <LiveIcon look={devLook(server)} size={18} className="wb-dv" />;
}

export function RestartDev({
  project,
  server,
  dev,
  className,
}: {
  project: Pick<WorkbenchProject, 'path'> & { dev: { command: string } | null };
  server: DevServer | undefined;
  dev: ReturnType<typeof useDevControl>;
  className: string;
}) {
  const health = devHealth(server);
  if (health !== 'crashed' && health !== 'errors') return null;
  return (
    <button
      type="button"
      className={className}
      title="Перезапустить dev-сервер"
      onClick={(e) => {
        e.stopPropagation();
        restartDev(dev, project, server);
      }}
    >
      <RotateCcw strokeWidth={2} />
    </button>
  );
}

export function restartDev(
  dev: ReturnType<typeof useDevControl>,
  project: Pick<WorkbenchProject, 'path'> & { dev: { command: string } | null },
  server: DevServer | undefined,
) {
  if (devHealth(server) !== 'crashed' && devRuns(server)) dev.askStop(project, true);
  else dev.start(project.path);
}

export function useDevControl() {
  const qc = useQueryClient();
  const openTab = useWorkbenchStore((s) => s.openTab);
  const [stopping, setStopping] = useState<{
    path: string;
    command: string;
    restart: boolean;
  } | null>(null);
  const [error, setError] = useState<{ title: string; text: string } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['workbench', 'dev'] });
  const fail = (title: string) => (e: unknown) => setError({ title, text: String(e) });

  const start = async (path: string) => {
    setError(null);
    const key = devTabKey(path);
    try {
      await startDevServer(path);
      await qc.invalidateQueries({ queryKey: ['workbench', 'dev'] });
      startTail(key, path, true);
      openTab(path, key);
    } catch (e) {
      fail('dev-сервер не запустился')(e);
    } finally {
      refresh();
    }
  };

  const dialogs = (
    <>
      <ConfirmDialog
        open={stopping !== null}
        title={stopping?.restart ? 'Перезапустить dev-сервер?' : 'Остановить dev-сервер?'}
        description={`${stopping?.command ?? 'dev'} — будут завершены все его процессы${stopping?.restart ? ', затем он запустится снова' : ''}.`}
        confirmLabel={stopping?.restart ? 'Перезапустить' : 'Остановить'}
        cancelLabel="Отмена"
        danger
        doneToast={stopping?.restart ? 'dev-сервер перезапускается' : 'dev-сервер остановлен'}
        failToast={stopping?.restart ? 'dev-сервер не перезапустился' : 'dev-сервер не остановился'}
        onConfirm={async () => {
          if (!stopping) return;
          await stopDevServer(stopping.path);
          setStopping(null);
          refresh();
          if (stopping.restart) void start(stopping.path);
          else closeDevLog(stopping.path);
        }}
        onCancel={() => setStopping(null)}
      />
      <ConfirmDialog
        open={error !== null}
        title={error?.title ?? ''}
        description={error?.text ?? ''}
        confirmLabel="Понятно"
        cancelLabel="Закрыть"
        onConfirm={() => setError(null)}
        onCancel={() => setError(null)}
      />
    </>
  );

  return {
    start: (path: string) => void start(path),
    askStop: (
      project: Pick<WorkbenchProject, 'path'> & { dev: { command: string } | null },
      restart = false,
    ) => setStopping({ path: project.path, command: project.dev?.command ?? 'dev', restart }),
    openBrowser: (path: string) => void openDevServer(path).catch(fail('Адрес не открылся')),
    fail,
    dialogs,
  };
}

export function DevCapsule({
  project,
  server,
}: {
  project: WorkbenchProject;
  server: DevServer | undefined;
}) {
  const openTab = useWorkbenchStore((s) => s.openTab);
  const openMenu = useOpenMenu();
  const dev = useDevControl();
  const { dialogs } = dev;
  if (!project.dev) return null;
  const state = devState(server);
  const key = devTabKey(project.path);
  const start = () => dev.start(project.path);
  const askStop = () => dev.askStop(project);
  const onContextMenu = (e: React.MouseEvent) =>
    openMenu(e, devTabMenu({ server, actions: devActions(dev, project, server) }));

  if (state === 'stopped') {
    return (
      <>
        <button
          type="button"
          className="wb-btn"
          title={project.dev.command}
          onClick={start}
          onContextMenu={onContextMenu}
        >
          <Play strokeWidth={2} />
          dev
        </button>
        {dialogs}
      </>
    );
  }

  const ports = server?.ports ?? [];
  return (
    <span
      role="toolbar"
      aria-label="dev-сервер"
      className="wb-cap"
      title={project.dev.command}
      onContextMenu={onContextMenu}
    >
      <DevDot server={server} />
      <button
        type="button"
        onClick={() => {
          openTab(project.path, key);
          focusSoon(key);
        }}
      >
        <b>dev</b>
      </button>
      <span>{server ? devStatusLabel(server) : ''}</span>
      {state === 'error' ? (
        <>
          <RestartDev project={project} server={server} dev={dev} className="wb-cap-i" />
          {!!server?.pids.length && (
            <button
              type="button"
              className="wb-cap-i wb-stop"
              title="Остановить dev-сервер"
              onClick={askStop}
            >
              <Square fill="currentColor" strokeWidth={2} />
            </button>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            className="wb-cap-i"
            title={ports[0] ? `Открыть localhost:${ports[0]}` : 'Порт ещё не открыт'}
            disabled={!ports[0]}
            onClick={() => dev.openBrowser(project.path)}
          >
            <Globe strokeWidth={2} />
          </button>
          <RestartDev project={project} server={server} dev={dev} className="wb-cap-i" />
          <button
            type="button"
            className="wb-cap-i wb-stop"
            title="Остановить dev-сервер"
            onClick={askStop}
          >
            <Square fill="currentColor" strokeWidth={2} />
          </button>
        </>
      )}
      {dialogs}
    </span>
  );
}
