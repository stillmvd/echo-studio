import { Power } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useOpenMenu } from '@/components/ui/ContextMenu';
import { useKillProcesses } from '@/hooks/use-workbench-overview';
import { cn } from '@/lib/cn';
import { revealInExplorer } from '@/lib/ipc';
import { describe, mb } from '@/lib/overview';
import type { KillResult, ProcessRow } from '@/lib/types';
import { copyText, processMenu } from './menus';

const GUARD_TITLE = {
  'live-session': 'Завершить процесс живой сессии Claude?',
  'running-dev': 'Остановить работающий dev-сервер?',
} as const;

interface Pending {
  rows: ProcessRow[];
  confirmed: boolean;
}

function failures(result: KillResult): string | null {
  return result.failed.length ? `не завершено: ${result.failed.length}` : null;
}

export interface RowHandlers {
  kill: (row: ProcessRow) => void;
  menu: (e: React.MouseEvent, row: ProcessRow) => void;
}

export function ProcessLine({
  row,
  on,
  nested,
}: {
  row: ProcessRow;
  on: RowHandlers;
  nested?: boolean;
}) {
  return (
    <span
      role="toolbar"
      aria-label={`${row.name} ${row.pid}`}
      className={cn('wb-pr', nested && 'in', row.orphan && 'orphan')}
      title={row.commandLine}
      onContextMenu={(e) => on.menu(e, row)}
    >
      <b>{row.name}</b>
      <span className="wb-dim">{describe(row)}</span>
      <span className="wb-mb">{mb(row.memory)}</span>
      <button
        type="button"
        className="wb-ib wb-kill"
        title="Завершить"
        aria-label={`Завершить ${row.name} ${row.pid}`}
        onClick={() => on.kill(row)}
      >
        <Power />
      </button>
    </span>
  );
}

export function useProcessKiller(): {
  on: RowHandlers;
  killAll: (rows: ProcessRow[]) => void;
  busy: boolean;
  note: string | null;
  dialog: ReactNode;
} {
  const kill = useKillProcesses();
  const openMenu = useOpenMenu();
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (list: ProcessRow[], confirmed: boolean) => {
    const targets = list.map((r) => ({ pid: r.pid, startTime: r.startTime }));
    const result = await kill.mutateAsync({ targets, confirmed });
    setNote(failures(result));
  };

  const onKill = (row: ProcessRow) => {
    if (row.guard) setPending({ rows: [row], confirmed: true });
    else void run([row], false).catch((e) => setNote(String(e)));
  };

  const on: RowHandlers = {
    kill: onKill,
    menu: (e, row) =>
      openMenu(
        e,
        processMenu({
          row,
          actions: {
            copyCommand: () => copyText(row.commandLine),
            openFolder: () => {
              if (row.projectPath)
                void revealInExplorer(row.projectPath).catch((err) => setNote(String(err)));
            },
            kill: () => onKill(row),
          },
        }),
      ),
  };

  const single = pending?.rows.length === 1 ? pending.rows[0] : undefined;
  const title = single?.guard
    ? GUARD_TITLE[single.guard]
    : `Завершить висящие процессы: ${pending?.rows.length ?? 0}?`;

  const dialog = (
    <ConfirmDialog
      open={!!pending}
      danger
      title={title}
      description={single ? `${single.name} · ${describe(single)}` : undefined}
      confirmLabel="Завершить"
      cancelLabel="Отмена"
      failToast="Процессы не завершились"
      busy={kill.isPending}
      onConfirm={async () => {
        if (!pending) return;
        await run(pending.rows, pending.confirmed);
        setPending(null);
      }}
      onCancel={() => setPending(null)}
    >
      {pending && !single && (
        <ul className="wb-klist">
          {pending.rows.map((r) => (
            <li key={r.pid}>
              <b>{r.name}</b>
              <span className="wb-dim">{describe(r)}</span>
              <span className="wb-mb">{mb(r.memory)}</span>
            </li>
          ))}
        </ul>
      )}
    </ConfirmDialog>
  );

  return {
    on,
    killAll: (rows) => setPending({ rows, confirmed: false }),
    busy: kill.isPending,
    note,
    dialog,
  };
}
