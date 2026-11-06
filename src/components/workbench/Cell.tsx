import { useQueryClient } from '@tanstack/react-query';
import { Ellipsis, Plus, X } from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useOpenMenu } from '@/components/ui/ContextMenu';
import { useAgentName } from '@/hooks/use-agent';
import { cn } from '@/lib/cn';
import { forgetClaudeSession, restartClaudeSession, stopClaudeSession } from '@/lib/ipc';
import type { ClaudeSession, DevServer, WorkbenchProject } from '@/lib/types';
import { agentName, devHealth, type StatusView, statusView } from '@/lib/workbench';
import { withoutVisit } from '@/state/recent-store';
import { devTabKey, isDevTab, useWorkbenchStore } from '@/state/workbench-store';
import { ClaudeTerminal } from './ClaudeTerminal';
import {
  closeDevLog,
  DevDot,
  devActions,
  restartDev,
  showDevLog,
  useDevControl,
} from './DevCapsule';
import { EmptyProject, sessionTitle, useResumable } from './EmptyProject';
import { LogTerminal } from './LogTerminal';
import {
  copyText,
  devRuns,
  devTabMenu,
  type MoveTargets,
  newTabMenu,
  sessionTabMenu,
} from './menus';
import { StatusIcon } from './StatusIcon';
import {
  connect,
  dispose,
  focusSoon,
  isFresh,
  reattach,
  rememberShort,
  restarting,
  shortOf,
  useClaudeTerm,
} from './terminals';
import { type DraggedTab, tabDragProps } from './useTabDrag';

export function useStopSession() {
  const qc = useQueryClient();
  const [stopping, setStopping] = useState<string | null>(null);
  const dialog = (
    <ConfirmDialog
      open={stopping !== null}
      title="Завершить сессию?"
      description="Агент завершит работу. Сессию можно продолжить из списка проекта."
      confirmLabel="Завершить"
      cancelLabel="Отмена"
      danger
      doneToast="Сессия завершена"
      failToast="Сессия не завершилась"
      onConfirm={async () => {
        if (stopping) await stopClaudeSession(stopping);
        setStopping(null);
        void qc.invalidateQueries({ queryKey: ['workbench', 'sessions'] });
      }}
      onCancel={() => setStopping(null)}
    />
  );
  return { ask: (shortId: string | null) => setStopping(shortId), dialog };
}

interface Restart {
  path: string;
  key: string;
  shortId: string;
  risky: boolean;
}

function useRestartSession() {
  const qc = useQueryClient();
  const [asking, setAsking] = useState<Restart | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const run = async (r: Restart) => {
    setRunning(r.key);
    restarting.add(r.key);
    try {
      const next = await restartClaudeSession(r.path, r.key, r.shortId);
      if (next.sessionId) rememberShort(next.sessionId, next.shortId, true);
      if (next.sessionId && next.sessionId !== r.key) {
        const st = useWorkbenchStore.getState();
        st.openTab(r.path, next.sessionId);
        dispose(r.key);
        st.closeTab(r.path, r.key);
      } else connect(r.key, next.shortId);
    } finally {
      restarting.delete(r.key);
      setRunning(null);
      void qc.invalidateQueries({ queryKey: ['workbench', 'sessions'] });
    }
  };
  const dialog = (
    <>
      <ConfirmDialog
        open={asking !== null}
        title="Перезапустить сессию?"
        description="Агент сейчас работает или держит фоновые команды (например, dev-сервер) — они остановятся. Разговор продолжится в новом процессе."
        confirmLabel="Перезапустить"
        cancelLabel="Отмена"
        doneToast="Сессия перезапущена"
        failToast="Сессия не перезапустилась"
        onConfirm={async () => {
          if (asking) await run(asking);
          setAsking(null);
        }}
        onCancel={() => setAsking(null)}
      />
      <ConfirmDialog
        open={failed !== null}
        title="Сессия не перезапустилась"
        description={failed ?? ''}
        confirmLabel="Понятно"
        cancelLabel="Закрыть"
        onConfirm={() => setFailed(null)}
        onCancel={() => setFailed(null)}
      />
    </>
  );
  const ask = (r: Restart) => {
    if (r.risky) setAsking(r);
    else run(r).catch((e) => setFailed(String(e)));
  };
  return { ask, running, dialog };
}

interface TabInfo {
  key: string;
  session: ClaudeSession | undefined;
  shortId: string | null;
  live: boolean;
  status: StatusView;
}

function TabTitle({ info, projectName }: { info: TabInfo; projectName: string }) {
  const entry = useClaudeTerm(info.key);
  const own = entry.title && entry.title !== projectName ? entry.title : null;
  const title = info.session?.name || own || agentName(info.session);
  return <span data-tip={title}>{title}</span>;
}

function TabCapsule({
  drag,
  on,
  label,
  onContextMenu,
  children,
}: {
  drag: DraggedTab | null;
  on: boolean;
  label: string;
  onContextMenu: (e: React.MouseEvent) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tab = ref.current;
    const strip = tab?.parentElement;
    if (!on || !tab || !strip) return;
    const reveal = () => tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    reveal();
    const watch = new ResizeObserver(reveal);
    watch.observe(strip);
    return () => watch.disconnect();
  }, [on]);
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      data-tip={label}
      className={cn('wb-tab', on && 'on')}
      onContextMenu={onContextMenu}
      {...tabDragProps(drag)}
    >
      {children}
    </div>
  );
}

interface Props {
  project: WorkbenchProject;
  sessions: ClaudeSession[];
  server: DevServer | undefined;
  visible: boolean;
  focused: boolean;
  keys: string[];
  activeKey?: string;
  onActivate: (key: string) => void;
  onStart: (resumeSessionId?: string) => Promise<string | null>;
  busy: boolean;
  cellId: string;
  insertAt?: number | null;
  canAdd?: boolean;
  moveTargets?: (key: string) => MoveTargets | null;
  lead?: ReactNode;
  tail?: ReactNode;
  onStripDoubleClick?: () => void;
}

export function Cell({
  project,
  sessions,
  server,
  visible,
  focused,
  keys: tabs,
  activeKey: active,
  onActivate,
  onStart,
  busy,
  cellId,
  insertAt = null,
  canAdd = true,
  moveTargets = () => null,
  lead,
  tail,
  onStripDoubleClick,
}: Props) {
  const isFocused = visible && focused;
  const openMenu = useOpenMenu();
  const dev = useDevControl();
  const stop = useStopSession();
  const restart = useRestartSession();
  const agent = useAgentName();
  const seen = useWorkbenchStore((s) => s.seen);
  const projectTabs = useWorkbenchStore((s) => s.tabs[project.path]) ?? tabs;
  const resumable = useResumable(project, visible && canAdd);
  const activate = (key: string) => {
    onActivate(key);
    focusSoon(key);
  };
  const startHere = async (resumeSessionId?: string) => {
    const key = await onStart(resumeSessionId);
    if (key) onActivate(key);
  };
  const closeTab = useWorkbenchStore((s) => s.closeTab);
  const markSeen = useWorkbenchStore((s) => s.markSeen);

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
        status: session ? statusView(session, seen) : live ? 'new' : 'exited',
      };
    });
  const devKey = devTabKey(project.path);
  const hasDev = tabs.includes(devKey) && devHealth(server) !== 'stopped';
  const order = tabs.filter((key) => (key === devKey ? hasDev : !isDevTab(key)));
  const devOn = hasDev && (active === devKey || infos.length === 0);
  const current = devOn ? undefined : (infos.find((i) => i.key === active) ?? infos[0]);

  useEffect(() => {
    if (isFocused && current?.session?.status === 'done') markSeen(current.key);
  }, [isFocused, current?.key, current?.session?.status, markSeen]);

  const shownKey = devOn ? devKey : current?.key;
  useEffect(() => {
    if (shownKey && !(active && tabs.includes(active))) withoutVisit(() => onActivate(shownKey));
  }, [onActivate, shownKey, active, tabs]);

  const close = (info: TabInfo) => {
    if (!info.live && info.shortId) void forgetClaudeSession(info.shortId).catch(() => {});
    dispose(info.key);
    closeTab(project.path, info.key);
  };

  const closeDev = () => closeDevLog(project.path);

  const devMenu = (e: React.MouseEvent) =>
    openMenu(
      e,
      devTabMenu({
        server,
        cells: moveTargets(devKey),
        actions: devActions(dev, project, server),
      }),
    );

  const tabMenu = (e: React.MouseEvent, info: TabInfo) =>
    openMenu(
      e,
      sessionTabMenu({
        live: info.live,
        canStop: info.live && !!info.shortId && restart.running !== info.key,
        cells: moveTargets(info.key),
        actions: {
          restart: () =>
            info.shortId &&
            restart.ask({
              path: project.path,
              key: info.key,
              shortId: info.shortId,
              risky: info.session?.status === 'working' || !!info.session?.shells,
            }),
          reconnect: () =>
            restart.running !== info.key && info.shortId && reattach(info.key, info.shortId),
          copyId: () => copyText(info.key),
          hide: () => close(info),
          stop: () => stop.ask(info.shortId),
        },
      }),
    );

  const addMenu = (e: React.MouseEvent) =>
    openMenu(
      e,
      newTabMenu({
        agent,
        busy,
        dev: project.dev
          ? {
              runs: devRuns(server),
              open: () => showDevLog(project.path),
              start: () => void dev.start(project.path),
            }
          : null,
        resume: resumable.map((s) => ({
          title: sessionTitle(s),
          start: () => void startHere(s.sessionId),
        })),
        actions: { newSession: () => void startHere() },
      }),
    );

  const empty = order.length === 0;
  if (empty && !lead && !tail) {
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
      <div
        className="wb-tabs"
        role="toolbar"
        aria-label={`Вкладки ${project.name}`}
        onDoubleClick={(e) => {
          if (!onStripDoubleClick || (e.target as Element).closest('button, .wb-tab')) return;
          onStripDoubleClick();
        }}
      >
        {lead}
        {order.map((key, i) => {
          const drag = { path: project.path, key, cell: cellId };
          const marker = insertAt === i && <span className="wb-tab-ins" aria-hidden="true" />;
          if (key === devKey) {
            return (
              <Fragment key={key}>
                {marker}
                <TabCapsule
                  drag={drag}
                  on={devOn}
                  label={project.dev?.command ?? 'dev'}
                  onContextMenu={devMenu}
                >
                  <button
                    type="button"
                    className="wb-tab-b"
                    aria-pressed={devOn}
                    onClick={() => activate(devKey)}
                  >
                    <DevDot server={server} />
                    <span data-tip={project.dev?.command}>{project.dev?.command ?? 'dev'}</span>
                  </button>
                  <button
                    type="button"
                    className="wb-tx"
                    data-tip="Закрыть лог (сервер продолжит работать)"
                    aria-label="Закрыть лог (сервер продолжит работать)"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeDev();
                    }}
                  >
                    <X strokeWidth={2} />
                  </button>
                </TabCapsule>
              </Fragment>
            );
          }
          const info = infos.find((x) => x.key === key);
          if (!info) return null;
          return (
            <Fragment key={key}>
              {marker}
              <TabCapsule
                drag={drag}
                on={info.key === current?.key}
                label={info.session?.name || agentName(info.session)}
                onContextMenu={(e) => tabMenu(e, info)}
              >
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
                    }}
                  />
                  <TabTitle info={info} projectName={project.name} />
                </button>
                <button
                  type="button"
                  className="wb-tx"
                  data-tip={info.live ? 'Скрыть вкладку — сессия продолжит работать' : 'Закрыть'}
                  aria-label={info.live ? 'Скрыть вкладку — сессия продолжит работать' : 'Закрыть'}
                  onClick={(e) => {
                    e.stopPropagation();
                    close(info);
                  }}
                >
                  <X strokeWidth={2} />
                </button>
              </TabCapsule>
            </Fragment>
          );
        })}
        {insertAt === order.length && <span className="wb-tab-ins" aria-hidden="true" />}
        {canAdd && (
          <button
            type="button"
            className="wb-tab add"
            data-tip="Новая вкладка — сессия или dev"
            aria-label="Новая вкладка — сессия или dev"
            aria-haspopup="menu"
            onClick={addMenu}
          >
            <Plus strokeWidth={2} />
          </button>
        )}
        <span className="wb-gap" />
        {(devOn || current) && (
          <button
            type="button"
            className="wb-ib"
            aria-haspopup="menu"
            data-tip={devOn ? 'Меню dev-сервера' : `Меню сессии ${agentName(current?.session)}`}
            aria-label={devOn ? 'Меню dev-сервера' : `Меню сессии ${agentName(current?.session)}`}
            onClick={(e) => {
              if (devOn) devMenu(e);
              else if (current) tabMenu(e, current);
            }}
          >
            <Ellipsis strokeWidth={2} />
          </button>
        )}
        {tail}
      </div>
      {devOn && (
        <LogTerminal
          tabKey={devKey}
          projectPath={project.path}
          visible={visible}
          server={server}
          onRestart={() => restartDev(dev, project, server)}
        />
      )}
      {current && (
        <ClaudeTerminal
          key={current.key}
          sessionKey={current.key}
          cwd={current.session?.cwd ?? project.path}
          shortId={current.shortId}
          live={current.live}
          status={current.status}
          visible={visible}
          focused={isFocused}
          accent={false}
          onResume={() => void startHere(current.key)}
          onStop={() => stop.ask(current.shortId)}
        />
      )}
      {empty && (
        <EmptyProject
          embedded
          open={projectTabs}
          project={project}
          server={server}
          visible={visible}
          busy={busy}
          onStart={(resume) => void startHere(resume)}
        />
      )}
      {stop.dialog}
      {restart.dialog}
      {dev.dialogs}
    </div>
  );
}
