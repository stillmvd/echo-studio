import { Cpu, Power } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useKillProcesses } from '@/hooks/use-workbench-overview';
import { describe, groupProcesses, mb, nameOf } from '@/lib/overview';
import type { KillResult, ProcessRow, WorkbenchProject } from '@/lib/types';
import { ProjectIcon } from './ProjectIcon';

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

function Row({ row, onKill }: { row: ProcessRow; onKill: (row: ProcessRow) => void }) {
  return (
    <span className="wb-pr" title={row.commandLine}>
      <b>{row.name}</b>
      <span className="wb-dim">{describe(row)}</span>
      <span className="wb-mb">{mb(row.memory)}</span>
      <button
        type="button"
        className="wb-ib wb-kill"
        title="Завершить"
        aria-label={`Завершить ${row.name} ${row.pid}`}
        onClick={() => onKill(row)}
      >
        <Power />
      </button>
    </span>
  );
}

export function Processes({
  rows,
  projects,
}: {
  rows: ProcessRow[];
  projects: Map<string, WorkbenchProject>;
}) {
  const kill = useKillProcesses();
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { stray, groups } = groupProcesses(rows);
  const strayMemory = stray.reduce((s, r) => s + r.memory, 0);
  const killable = stray.filter((r) => !r.guard);

  const run = async (list: ProcessRow[], confirmed: boolean) => {
    const targets = list.map((r) => ({ pid: r.pid, startTime: r.startTime }));
    const result = await kill.mutateAsync({ targets, confirmed });
    setNote(failures(result));
  };

  const onKill = (row: ProcessRow) => {
    if (row.guard) setPending({ rows: [row], confirmed: true });
    else void run([row], false).catch((e) => setNote(String(e)));
  };

  const single = pending?.rows.length === 1 ? pending.rows[0] : undefined;
  const title = single?.guard
    ? GUARD_TITLE[single.guard]
    : `Завершить висящие процессы: ${pending?.rows.length ?? 0}?`;

  return (
    <>
      {note && <span className="wb-pnote">{note}</span>}
      {stray.length > 0 && (
        <div className="wb-pg stray hot">
          <div className="wb-pgh">
            <span className="wb-pi none">
              <Cpu strokeWidth={1.75} />
            </span>
            <b>Без проекта</b>
            <span className="wb-dim">висящие</span>
            <span className="wb-mb">{mb(strayMemory)}</span>
            {killable.length > 0 && (
              <button
                type="button"
                className="wb-btn sm"
                disabled={kill.isPending}
                onClick={() => setPending({ rows: killable, confirmed: false })}
              >
                <Power />
                Завершить все
              </button>
            )}
          </div>
          {stray.map((r) => (
            <Row key={r.pid} row={r} onKill={onKill} />
          ))}
        </div>
      )}
      {groups.map((g) => {
        const project = g.key ? projects.get(g.key) : undefined;
        return (
          <div key={g.key ?? '—'} className="wb-pg">
            <div className="wb-pgh">
              <ProjectIcon svg={project?.icon ?? null} />
              <b>{project?.name ?? (g.key ? nameOf(g.key) : 'Без проекта')}</b>
              {!g.key && <span className="wb-dim">работает</span>}
              <span className="wb-mb">{mb(g.memory)}</span>
            </div>
            {g.rows.map((r) => (
              <Row key={r.pid} row={r} onKill={onKill} />
            ))}
          </div>
        );
      })}
      {rows.length === 0 && <span className="wb-dim">Процессов нет</span>}
      <ConfirmDialog
        open={!!pending}
        danger
        title={title}
        description={single ? `${single.name} · ${describe(single)}` : undefined}
        confirmLabel="Завершить"
        cancelLabel="Отмена"
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
    </>
  );
}
