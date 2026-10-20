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
  const [pending, setPending] = useState<ProcessRow | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { stray, groups } = groupProcesses(rows);
  const strayMemory = stray.reduce((s, r) => s + r.memory, 0);
  const killable = stray.filter((r) => !r.guard).map((r) => r.pid);

  const run = async (pids: number[], confirmed: boolean) => {
    const result = await kill.mutateAsync({ pids, confirmed });
    setNote(failures(result));
  };

  const onKill = (row: ProcessRow) => {
    if (row.guard) setPending(row);
    else void run([row.pid], false).catch((e) => setNote(String(e)));
  };

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
                onClick={() => void run(killable, false).catch((e) => setNote(String(e)))}
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
              <b>{project?.name ?? nameOf(g.key)}</b>
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
        title={pending?.guard ? GUARD_TITLE[pending.guard] : ''}
        description={pending ? `${pending.name} · ${describe(pending)}` : undefined}
        confirmLabel="Завершить"
        cancelLabel="Отмена"
        busy={kill.isPending}
        onConfirm={async () => {
          if (!pending) return;
          await run([pending.pid], true);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
