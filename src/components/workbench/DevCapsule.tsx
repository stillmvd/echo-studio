import { useQueryClient } from '@tanstack/react-query';
import { Globe, Play, RotateCcw, Square } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useOpenMenu } from '@/components/ui/ContextMenu';
import { cn } from '@/lib/cn';
import { openDevServer, startDevServer, stopDevServer } from '@/lib/ipc';
import type { DevServer, WorkbenchProject } from '@/lib/types';
import { devTabKey, useWorkbenchStore } from '@/state/workbench-store';
import { copyText, devRuns, devTabMenu, devUrl } from './menus';
import { dispose, startTail } from './terminals';

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

const DEV_LABEL = { starting: 'запускается', running: '', stopped: '', error: 'ошибка' } as const;

export function devState(server: DevServer | undefined) {
  return server?.state ?? 'stopped';
}

export function DevDot({ server, large }: { server: DevServer | undefined; large?: boolean }) {
  return (
    <span className={cn('wb-dv', `st-${devState(server)}`, large && 'lg')}>
      <i />
    </span>
  );
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
        onConfirm={async () => {
          if (!stopping) return;
          await stopDevServer(stopping.path);
          setStopping(null);
          refresh();
          if (stopping.restart) void start(stopping.path);
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
  large,
}: {
  project: WorkbenchProject;
  server: DevServer | undefined;
  large?: boolean;
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
          className={cn('wb-btn', large && 'lg')}
          title={project.dev.command}
          onClick={start}
          onContextMenu={onContextMenu}
        >
          <Play strokeWidth={2} />
          {large ? project.dev.command : 'dev'}
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
      <button type="button" onClick={() => openTab(project.path, key)}>
        <b>dev</b>
      </button>
      <span>{DEV_LABEL[state] || ports.map((p) => `:${p}`).join(' ') || 'без порта'}</span>
      {state === 'error' ? (
        <>
          <button type="button" className="wb-cap-i" title="Запустить снова" onClick={start}>
            <RotateCcw strokeWidth={2} />
          </button>
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
