import { useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Square, X } from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useOpenMenu } from '@/components/ui/ContextMenu';
import { useConversationProjects, useConversationSessions } from '@/hooks/use-conversations';
import { cn } from '@/lib/cn';
import { forgetClaudeSession, stopClaudeSession } from '@/lib/ipc';
import type { ClaudeSession, DevServer, WorkbenchProject } from '@/lib/types';
import {
  CELL_COUNT,
  type ProjectCell,
  type StatusView,
  samePath,
  statusView,
} from '@/lib/workbench';
import { withoutVisit } from '@/state/recent-store';
import { devTabKey, isDevTab, useProjectLayout, useWorkbenchStore } from '@/state/workbench-store';
import { ClaudeTerminal } from './ClaudeTerminal';
import { closeDevLog, DevCapsule, DevDot, devActions, useDevControl } from './DevCapsule';
import { EmptyProject } from './EmptyProject';
import { LogTerminal } from './LogTerminal';
import { copyText, devTabMenu, type MoveTargets, sessionTabMenu } from './menus';
import { StatusIcon } from './StatusIcon';
import { dispose, isFresh, reattach, rememberShort, shortOf, useClaudeTerm } from './terminals';
import { type DraggedTab, tabDragProps, useTabDrop } from './useTabDrag';

const NO_TABS: string[] = [];
const CELL_IDS = ['p1', 'p2', 'p3', 'p4'];

function useGoneTabs(path: string, exited: string[]): string[] {
  const projects = useConversationProjects();
  const slug = path.replace(/[^A-Za-z0-9]/g, '-');
  const matches = projects.data?.filter((p) => samePath(p.cwd, path)) ?? [];
  const convId = (matches.find((p) => p.id === slug) ?? matches[0])?.id ?? null;
  const sessions = useConversationSessions(exited.length ? convId : null);
  const since = useRef(new Map<string, number>());
  const now = Date.now();
  for (const key of exited) if (!since.current.has(key)) since.current.set(key, now);
  const from = Math.max(0, ...exited.map((key) => since.current.get(key) ?? 0));
  const projectsFresh = projects.dataUpdatedAt > from;
  const sessionsFresh = convId === null || sessions.dataUpdatedAt > from;
  const waiting = exited.length > 0 && (!projectsFresh || !sessionsFresh);
  const busy = projects.isFetching || sessions.isFetching;
  const { refetch: refetchProjects } = projects;
  const { refetch: refetchSessions } = sessions;
  useEffect(() => {
    if (!waiting || busy) return;
    if (!projectsFresh) void refetchProjects();
    else void refetchSessions();
  }, [waiting, busy, projectsFresh, refetchProjects, refetchSessions]);
  if (exited.length === 0 || waiting) return NO_TABS;
  const known = new Set(sessions.data?.map((s) => s.sessionId));
  return exited.filter((key) => !known.has(key));
}

export function useStopSession() {
  const qc = useQueryClient();
  const [stopping, setStopping] = useState<string | null>(null);
  const dialog = (
    <ConfirmDialog
      open={stopping !== null}
      title="Завершить сессию?"
      description="Claude завершит работу. Разговор сохранится — его можно продолжить из списка проекта."
      confirmLabel="Завершить"
      cancelLabel="Отмена"
      danger
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

function useMoveTargets(path: string, cellId: string | undefined) {
  const projectLayout = useProjectLayout(path).layout;
  const wallLayout = useWorkbenchStore((s) => s.layout);
  const wallCells = useWorkbenchStore((s) => s.cells);
  const moveTab = useWorkbenchStore((s) => s.moveTab);
  const moveTabToWallCell = useWorkbenchStore((s) => s.moveTabToWallCell);
  return (key: string): MoveTargets | null => {
    if (!cellId) return null;
    const own = CELL_IDS.indexOf(cellId);
    if (own >= 0) {
      return {
        count: CELL_COUNT[projectLayout],
        current: own,
        move: (i) => moveTab(path, key, i),
      };
    }
    const shown = wallCells.slice(0, CELL_COUNT[wallLayout]);
    return {
      count: shown.length,
      current: shown.findIndex((c) => c.id === cellId),
      move: (i) => {
        const target = shown[i];
        if (target) moveTabToWallCell(target.id, path, key);
      },
    };
  };
}

interface GridProps {
  project: WorkbenchProject;
  sessions: ClaudeSession[];
  server: DevServer | undefined;
  visible: boolean;
  busy: boolean;
  onStart: (resumeSessionId?: string) => Promise<string | null>;
}

export function ProjectGrid(props: GridProps) {
  const layout = useProjectLayout(props.project.path);
  const hasTabs = useWorkbenchStore((s) => (s.tabs[props.project.path]?.length ?? 0) > 0);
  const one = layout.layout === '1x1';
  return (
    <div className={one ? 'flex min-h-0 flex-1 flex-col' : `wl-grid pg l-${layout.layout}`}>
      {CELL_IDS.slice(0, CELL_COUNT[layout.layout]).map((id, i) => (
        <ProjectCellView
          key={id}
          {...props}
          id={id}
          index={i}
          one={one}
          cell={layout.cells[i] ?? { tabs: [] }}
          focused={layout.focus === i}
          hasTabs={hasTabs}
        />
      ))}
    </div>
  );
}

interface CellViewProps extends GridProps {
  id: string;
  index: number;
  one: boolean;
  cell: ProjectCell;
  focused: boolean;
  hasTabs: boolean;
}

function ProjectCellView({
  id,
  index,
  one,
  cell,
  focused,
  hasTabs,
  onStart,
  ...props
}: CellViewProps) {
  const { project, busy, server } = props;
  const moveTab = useWorkbenchStore((s) => s.moveTab);
  const focusCell = useWorkbenchStore((s) => s.focusProjectCell);
  const drop = useTabDrop({
    path: project.path,
    cell: id,
    keys: cell.tabs,
    accept: (tab) => samePath(tab.path, project.path),
    onDrop: (tab, at) => moveTab(project.path, tab.key, index, at),
  });
  const touch = () => {
    if (!focused) focusCell(project.path, index);
  };
  const startHere = (resume?: string) => {
    focusCell(project.path, index);
    return onStart(resume);
  };
  const free = hasTabs ? cell.tabs.length === 0 : !focused;
  return (
    <div
      className={
        one ? 'flex min-h-0 flex-1 flex-col' : cn('wl-cell', focused && 'fx', drop.over && 'drop')
      }
      onPointerDownCapture={touch}
      onKeyDownCapture={touch}
      {...drop.props}
    >
      {free ? (
        <div className="wl-free">
          <span className="wb-dim">Свободная ячейка</span>
          <div>
            <button
              type="button"
              className="wb-btn p"
              disabled={busy}
              onClick={() => void startHere()}
            >
              <Plus strokeWidth={2} />
              Claude
            </button>
            {project.dev && <DevCapsule project={project} server={server} />}
          </div>
          <span className="wb-dim">Перетащите сюда вкладку</span>
        </div>
      ) : (
        <Cell
          {...props}
          keys={cell.tabs}
          activeKey={cell.active}
          focused={focused}
          accent
          cellId={id}
          insertAt={drop.insert}
          onStart={startHere}
        />
      )}
    </div>
  );
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
  const title = info.session?.name || own || 'Claude';
  return <span title={title}>{title}</span>;
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
  return (
    <div
      role="toolbar"
      aria-label={label}
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
  focused?: boolean;
  activeKey?: string;
  onActivate?: (key: string) => void;
  onStart: (resumeSessionId?: string) => Promise<string | null>;
  busy: boolean;
  keys?: string[];
  cellId?: string;
  insertAt?: number | null;
  accent?: boolean;
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
  keys,
  cellId,
  insertAt = null,
  accent = focused === undefined,
}: Props) {
  const controlled = onActivate !== undefined;
  const isFocused = visible && (focused ?? true);
  const openMenu = useOpenMenu();
  const dev = useDevControl();
  const stop = useStopSession();
  const moveTargets = useMoveTargets(project.path, cellId);
  const projectTabs = useWorkbenchStore((s) => s.tabs[project.path]) ?? NO_TABS;
  const tabs = keys ?? projectTabs;
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
  const gone = useGoneTabs(
    project.path,
    infos.filter((i) => !i.live).map((i) => i.key),
  ).join('\n');
  useEffect(() => {
    if (!gone) return;
    for (const key of gone.split('\n')) {
      dispose(key);
      closeTab(project.path, key);
    }
  }, [gone, project.path, closeTab]);
  const devKey = devTabKey(project.path);
  const hasDev = tabs.includes(devKey);
  const order = tabs.filter((key) => key === devKey || !isDevTab(key));
  const devOn = hasDev && (active === devKey || infos.length === 0);
  const current = devOn ? undefined : (infos.find((i) => i.key === active) ?? infos[0]);

  useEffect(() => {
    if (isFocused && current?.session?.status === 'done') markSeen(current.key);
  }, [isFocused, current?.key, current?.session?.status, markSeen]);

  const shownKey = devOn ? devKey : current?.key;
  useEffect(() => {
    if (onActivate && shownKey && shownKey !== activeKey) withoutVisit(() => onActivate(shownKey));
  }, [onActivate, shownKey, activeKey]);

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
        canStop: info.live && !!info.shortId,
        cells: moveTargets(info.key),
        actions: {
          reconnect: () => info.shortId && reattach(info.key, info.shortId),
          copyId: () => copyText(info.key),
          hide: () => close(info),
          stop: () => stop.ask(info.shortId),
        },
      }),
    );

  if (projectTabs.length === 0) {
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
        {order.map((key, i) => {
          const drag = cellId ? { path: project.path, key, cell: cellId } : null;
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
                label={info.session?.name || 'Claude'}
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
              </TabCapsule>
            </Fragment>
          );
        })}
        {insertAt === order.length && <span className="wb-tab-ins" aria-hidden="true" />}
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
              onClick={() => stop.ask(current.shortId)}
            >
              <Square fill="currentColor" strokeWidth={2} />
              <span className="wb-stop-l">Завершить сессию</span>
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
          accent={accent && info.status === 'waiting'}
          onResume={() => void startHere(info.key)}
          onStop={() => stop.ask(info.shortId)}
        />
      ))}
      {stop.dialog}
      {dev.dialogs}
    </div>
  );
}
