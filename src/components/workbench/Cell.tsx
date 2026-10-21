import { useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/cn';
import { forgetClaudeSession, stopClaudeSession } from '@/lib/ipc';
import type { ClaudeSession, DevServer, SessionStatus, WorkbenchProject } from '@/lib/types';
import { effectiveStatus } from '@/lib/workbench';
import { devTabKey, isDevTab, useWorkbenchStore } from '@/state/workbench-store';
import { ClaudeTerminal } from './ClaudeTerminal';
import { DevDot } from './DevCapsule';
import { EmptyProject } from './EmptyProject';
import { LogTerminal } from './LogTerminal';
import { StatusIcon } from './StatusIcon';
import { dispose, isFresh, reattach, rememberShort, shortOf, useClaudeTerm } from './terminals';

interface TabInfo {
  key: string;
  session: ClaudeSession | undefined;
  shortId: string | null;
  live: boolean;
  status: SessionStatus;
}

function TabTitle({ info, projectName }: { info: TabInfo; projectName: string }) {
  const entry = useClaudeTerm(info.key);
  const own = entry.title && entry.title !== projectName ? entry.title : null;
  const title = info.session?.name || own || 'Claude';
  return <span title={title}>{title}</span>;
}

interface Props {
  project: WorkbenchProject;
  sessions: ClaudeSession[];
  server: DevServer | undefined;
  visible: boolean;
  focused?: boolean;
  activeKey?: string;
  onActivate?: (key: string) => void;
  onStart: (resumeSessionId?: string) => Promise<string | null>;
  busy: boolean;
}

export function Cell({
  project,
  sessions,
  server,
  visible,
  focused,
  activeKey,
  onActivate,
  onStart,
  busy,
}: Props) {
  const inWall = focused !== undefined;
  const controlled = onActivate !== undefined;
  const isFocused = visible && (focused ?? true);
  const qc = useQueryClient();
  const tabs = useWorkbenchStore((s) => s.tabs[project.path]) ?? [];
  const projectActive = useWorkbenchStore((s) => s.activeTab[project.path]);
  const active = activeKey ?? projectActive;
  const seen = useWorkbenchStore((s) => s.seen);
  const activateInProject = useWorkbenchStore((s) => s.activate);
  const activate = (key: string) =>
    onActivate ? onActivate(key) : activateInProject(project.path, key);
  const startHere = async (resumeSessionId?: string) => {
    const key = await onStart(resumeSessionId);
    if (key && onActivate) onActivate(key);
  };
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
    if (isFocused && current?.session?.status === 'done') markSeen(current.key);
  }, [isFocused, current?.key, current?.session?.status, markSeen]);

  const shownKey = devOn ? devKey : current?.key;
  useEffect(() => {
    if (onActivate && shownKey && shownKey !== activeKey) onActivate(shownKey);
  }, [onActivate, shownKey, activeKey]);

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
      <EmptyProject
        project={project}
        server={server}
        visible={visible}
        busy={busy}
        onStart={(resume) => void startHere(resume)}
      />
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
              onClick={() => activate(devKey)}
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
              onClick={() => activate(info.key)}
            >
              <StatusIcon
                small
                session={{
                  status: info.status,
                  phase: info.session?.phase ?? null,
                  tool: info.session?.tool ?? null,
                }}
              />
              <TabTitle info={info} projectName={project.name} />
            </button>
            <button
              type="button"
              className="wb-tx"
              title={info.live ? 'Скрыть вкладку — сессия продолжит работать' : 'Закрыть'}
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
          onClick={() => void startHere()}
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
              className="wb-btn sm wb-stop"
              title="Завершить сессию Claude (с подтверждением)"
              onClick={() => setStopping(current)}
            >
              <Square fill="currentColor" strokeWidth={2} />
              Завершить сессию
            </button>
          </>
        )}
      </div>
      {hasDev && (!controlled || devOn) && (
        <LogTerminal tabKey={devKey} projectPath={project.path} visible={visible && devOn} />
      )}
      {(controlled ? infos.filter((i) => i.key === current?.key) : infos).map((info) => (
        <ClaudeTerminal
          key={info.key}
          sessionKey={info.key}
          shortId={info.shortId}
          live={info.live}
          status={info.status}
          visible={visible && info.key === current?.key}
          focused={isFocused}
          accent={!inWall && info.status === 'waiting'}
          onResume={() => void startHere(info.key)}
          onStop={() => setStopping(info)}
        />
      ))}
      <ConfirmDialog
        open={stopping !== null}
        title="Завершить сессию?"
        description="Claude завершит работу. Разговор сохранится — его можно продолжить из списка проекта."
        confirmLabel="Завершить"
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
