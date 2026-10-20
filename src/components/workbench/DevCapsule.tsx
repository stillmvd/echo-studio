import { useQueryClient } from '@tanstack/react-query';
import { Globe, Play, RotateCcw, Square } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/cn';
import { openDevServer, startDevServer, stopDevServer } from '@/lib/ipc';
import type { DevServer, WorkbenchProject } from '@/lib/types';
import { devTabKey, useWorkbenchStore } from '@/state/workbench-store';
import { startTail } from './terminals';

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

export function DevCapsule({
  project,
  server,
}: {
  project: WorkbenchProject;
  server: DevServer | undefined;
}) {
  const qc = useQueryClient();
  const openTab = useWorkbenchStore((s) => s.openTab);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!project.dev) return null;
  const state = devState(server);
  const key = devTabKey(project.path);

  const start = async () => {
    setError(null);
    try {
      await startDevServer(project.path);
      startTail(key, project.path, true);
      openTab(project.path, key);
    } catch (e) {
      setError(String(e));
    } finally {
      void qc.invalidateQueries({ queryKey: ['workbench', 'dev'] });
    }
  };

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirmStop}
        title="Остановить dev-сервер?"
        description={`${project.dev.command} — будут завершены все его процессы.`}
        confirmLabel="Остановить"
        cancelLabel="Отмена"
        danger
        onConfirm={async () => {
          await stopDevServer(project.path);
          setConfirmStop(false);
          void qc.invalidateQueries({ queryKey: ['workbench', 'dev'] });
        }}
        onCancel={() => setConfirmStop(false)}
      />
      <ConfirmDialog
        open={error !== null}
        title="dev-сервер не запустился"
        description={error ?? ''}
        confirmLabel="Понятно"
        cancelLabel="Закрыть"
        onConfirm={() => setError(null)}
        onCancel={() => setError(null)}
      />
    </>
  );

  if (state === 'stopped') {
    return (
      <>
        <button
          type="button"
          className="wb-btn"
          title={project.dev.command}
          onClick={() => void start()}
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
    <span className="wb-cap" title={project.dev.command}>
      <DevDot server={server} />
      <button type="button" onClick={() => openTab(project.path, key)}>
        <b>dev</b>
      </button>
      <span>{DEV_LABEL[state] || ports.map((p) => `:${p}`).join(' ') || 'без порта'}</span>
      {state === 'error' ? (
        <button
          type="button"
          className="wb-cap-i"
          title="Запустить снова"
          onClick={() => void start()}
        >
          <RotateCcw strokeWidth={2} />
        </button>
      ) : (
        <>
          <button
            type="button"
            className="wb-cap-i"
            title={ports[0] ? `Открыть localhost:${ports[0]}` : 'Порт ещё не открыт'}
            disabled={!ports[0]}
            onClick={() => void openDevServer(project.path).catch((e) => setError(String(e)))}
          >
            <Globe strokeWidth={2} />
          </button>
          <button
            type="button"
            className="wb-cap-i"
            title="Остановить"
            onClick={() => setConfirmStop(true)}
          >
            <Square strokeWidth={2} />
          </button>
        </>
      )}
      {dialogs}
    </span>
  );
}
