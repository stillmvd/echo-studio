import { useQueryClient } from '@tanstack/react-query';
import { Play, Plus, RotateCcw, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/cn';
import { forgetClaudeSession, stopClaudeSession } from '@/lib/ipc';
import type { ClaudeSession, DevServer, SessionStatus, WorkbenchProject } from '@/lib/types';
import { effectiveStatus } from '@/lib/workbench';
import { devTabKey, isDevTab, useWorkbenchStore } from '@/state/workbench-store';
import { ClaudeTerminal } from './ClaudeTerminal';
import { DevDot } from './DevCapsule';
import { LogTerminal } from './LogTerminal';
import { ProjectIcon } from './ProjectIcon';
import { StatusIcon } from './StatusIcon';
import { dispose, isFresh, reattach, rememberShort, shortOf, useClaudeTerm } from './terminals';

interface TabInfo {
  key: string;
  session: ClaudeSession | undefined;
  shortId: string | null;
  live: boolean;
  status: SessionStatus;
}

function TabTitle({ info }: { info: TabInfo }) {
  const entry = useClaudeTerm(info.key);
  const title = info.session?.name || entry.title || 'Claude';
  return <span title={title}>{title}</span>;
}

interface Props {
  project: WorkbenchProject;
  sessions: ClaudeSession[];
  server: DevServer | undefined;
  visible: boolean;
  onStart: (resumeSessionId?: string) => void;
  busy: boolean;
}

export function Cell({ project, sessions, server, visible, onStart, busy }: Props) {
  const qc = useQueryClient();
  const tabs = useWorkbenchStore((s) => s.tabs[project.path]) ?? [];
  const active = useWorkbenchStore((s) => s.activeTab[project.path]);
  const seen = useWorkbenchStore((s) => s.seen);
  const activate = useWorkbenchStore((s) => s.activate);
  const closeTab = useWorkbenchStore((s) => s.closeTab);
  const markSeen = useWorkbenchStore((s) => s.markSeen);
  const [stopping, setStopping] = useState<TabInfo | null>(null);

  const infos: TabInfo[] = tabs
    .filter((key) => !isDevTab(key))
    .map((key) => {
      const session = sessions.find((s) => s.sessionId === key);
      if (session?.shortId) rememberShort(key, session.shortId);
      const live = !!session || isFresh(key);
      return {
        key,
        session,
        shortId: session?.shortId ?? shortOf(key),
        live,
        status: session ? effectiveStatus(session, seen) : live ? 'idle' : 'exited',
      };
    });
  const devKey = devTabKey(project.path);
  const hasDev = tabs.includes(devKey);
  const devOn = hasDev && (active === devKey || infos.length === 0);
  const current = devOn ? undefined : (infos.find((i) => i.key === active) ?? infos[0]);

  useEffect(() => {
    if (visible && current?.session?.status === 'done') markSeen(current.key);
  }, [visible, current?.key, current?.session?.status, markSeen]);

  const close = (info: TabInfo) => {
    if (!info.live && info.shortId) void forgetClaudeSession(info.shortId).catch(() => {});
    dispose(info.key);
    closeTab(project.path, info.key);
  };

  const closeDev = () => {
    dispose(devKey);
    closeTab(project.path, devKey);
  };

  if (infos.length === 0 && !hasDev) {
    return (
      <div className="wb-area">
        <div className="wb-empty">
          <ProjectIcon svg={project.icon} size="xl" />
          <div className="wb-eb">
            <button type="button" className="wb-btn p lg" disabled={busy} onClick={() => onStart()}>
              <Plus strokeWidth={2} />
              Новая сессия Claude
            </button>
            {project.dev && (
              <button type="button" className="wb-btn lg" disabled>
                <Play strokeWidth={2} />
                {project.dev.command}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wb-area">
      <div className="wb-tabs">
        {hasDev && (
          <div className={cn('wb-tab', devOn && 'on')}>
            <button
              type="button"
              className="wb-tab-b"
              aria-pressed={devOn}
              onClick={() => activate(project.path, devKey)}
            >
              <DevDot server={server} />
              <span title={project.dev?.command}>{project.dev?.command ?? 'dev'}</span>
            </button>
            <button
              type="button"
              className="wb-tx"
              title="Закрыть лог (сервер продолжит работать)"
              onClick={(e) => {
                e.stopPropagation();
                closeDev();
              }}
            >
              <X strokeWidth={2} />
            </button>
          </div>
        )}
        {infos.map((info) => (
          <div key={info.key} className={cn('wb-tab', info.key === current?.key && 'on')}>
            <button
              type="button"
              className="wb-tab-b"
              aria-pressed={info.key === current?.key}
              onClick={() => activate(project.path, info.key)}
            >
              <StatusIcon
                small
                session={{
                  status: info.status,
                  phase: info.session?.phase ?? null,
                  tool: info.session?.tool ?? null,
                }}
              />
              <TabTitle info={info} />
            </button>
            <button
              type="button"
              className="wb-tx"
              title={info.live ? 'Закрыть вкладку (сессия продолжит работать)' : 'Закрыть'}
              onClick={(e) => {
                e.stopPropagation();
                close(info);
              }}
            >
              <X strokeWidth={2} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="wb-tab add"
          title="Ещё сессия"
          disabled={busy}
          onClick={() => onStart()}
        >
          <Plus strokeWidth={2} />
        </button>
        <span className="wb-gap" />
        {current?.live && current.shortId && (
          <>
            <button
              type="button"
              className="wb-ib"
              title="Переподключить"
              onClick={() => current.shortId && reattach(current.key, current.shortId)}
            >
              <RotateCcw strokeWidth={2} />
            </button>
            <button
              type="button"
              className="wb-ib"
              title="Остановить сессию"
              onClick={() => setStopping(current)}
            >
              <Square strokeWidth={2} />
            </button>
          </>
        )}
      </div>
      {hasDev && (
        <LogTerminal tabKey={devKey} projectPath={project.path} visible={visible && devOn} />
      )}
      {infos.map((info) => (
        <ClaudeTerminal
          key={info.key}
          sessionKey={info.key}
          shortId={info.shortId}
          live={info.live}
          visible={visible && info.key === current?.key}
          accent={info.status === 'waiting'}
          onResume={() => onStart(info.key)}
        />
      ))}
      <ConfirmDialog
        open={stopping !== null}
        title="Остановить сессию?"
        description="Claude завершит работу в этой сессии. Разговор сохранится, его можно будет продолжить."
        confirmLabel="Остановить"
        cancelLabel="Отмена"
        danger
        onConfirm={async () => {
          if (stopping?.shortId) await stopClaudeSession(stopping.shortId);
          setStopping(null);
          void qc.invalidateQueries({ queryKey: ['workbench', 'sessions'] });
        }}
        onCancel={() => setStopping(null)}
      />
    </div>
  );
}
