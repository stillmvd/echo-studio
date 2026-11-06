import { useQuery } from '@tanstack/react-query';
import { Columns2, Grid2x2, Maximize2, Minimize2, Pin, Plus, Square } from 'lucide-react';
import { type HTMLAttributes, type ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { listClaudeSessions, listWorkbenchProjects } from '@/lib/ipc';
import type { ClaudeSession, DevServer, WorkbenchProject } from '@/lib/types';
import {
  arrangeWall,
  assignTabs,
  CELL_COUNT,
  HANDS_ON_MS,
  STATUS_LABEL,
  samePath,
  topStatus,
  urgentTab,
  type WallCell,
  type WallLayout,
  wallPick,
} from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { Cell } from './Cell';
import { EmptyProject } from './EmptyProject';
import { ModeSwitch } from './ModeSwitch';
import { ProjectHeader } from './ProjectHeader';
import { ProjectIcon } from './ProjectIcon';
import { StatusIcon } from './StatusIcon';
import { isFresh } from './terminals';
import { type DraggedTab, useTabDrop } from './useTabDrag';

interface ZoneProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  cell: WallCell;
  keys: string[];
  onDropTab: (tab: DraggedTab, at: number | undefined) => void;
  children: (insertAt: number | null) => ReactNode;
}

function WallCellZone({ cell, keys, onDropTab, className, children, ...rest }: ZoneProps) {
  const drop = useTabDrop({
    path: cell.projectPath,
    cell: cell.id,
    keys,
    accept: () => true,
    onDrop: onDropTab,
  });
  return (
    <div {...rest} className={cn(className, drop.over && 'drop')} {...drop.props}>
      {children(drop.insert)}
    </div>
  );
}

const LAYOUTS: { key: WallLayout; label: string; Icon: typeof Square }[] = [
  { key: '1x1', label: '1×1', Icon: Square },
  { key: '2x1', label: '2×1', Icon: Columns2 },
  { key: '2x2', label: '2×2', Icon: Grid2x2 },
];

export function LayoutPicker({
  layout,
  setLayout,
}: {
  layout: WallLayout;
  setLayout: (layout: WallLayout) => void;
}) {
  return (
    <fieldset className="wl-seg" aria-label="Раскладка экрана">
      {LAYOUTS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={key === layout}
          aria-label={`Раскладка ${label}`}
          data-tip={`Раскладка ${label}`}
          className={cn(key === layout && 'on')}
          onClick={() => setLayout(key)}
        >
          <Icon strokeWidth={1.75} />
        </button>
      ))}
    </fieldset>
  );
}

function showUrgent(moved: WallCell[], sessions: ClaudeSession[], seen: Record<string, number>) {
  const picked = new Map<string, { path: string; key: string }>();
  for (const c of moved) {
    if (!c.projectPath) continue;
    const key = c.activeTab ?? urgentTab(sessions, c.projectPath, seen);
    if (key) picked.set(c.id, { path: c.projectPath, key });
  }
  const st = useWorkbenchStore.getState();
  st.adoptTabs([...picked.values()]);
  useWorkbenchStore.setState((s) => ({
    cells: s.cells.map((c) => {
      const p = picked.get(c.id);
      return p ? { ...c, activeTab: p.key } : c;
    }),
  }));
}

function usePruneCells(projects: Map<string, WorkbenchProject>) {
  const pruneCells = useWorkbenchStore((s) => s.pruneCells);
  const scannedAt = useQuery({
    queryKey: ['workbench', 'projects'],
    queryFn: listWorkbenchProjects,
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  }).dataUpdatedAt;
  useEffect(() => {
    if (!scannedAt || scannedAt === lastScan) return;
    lastScan = scannedAt;
    const exists = (path: string) => [...projects.keys()].some((p) => samePath(p, path));
    const now = new Set(
      useWorkbenchStore
        .getState()
        .cells.flatMap((c) => (c.projectPath && !exists(c.projectPath) ? [c.projectPath] : [])),
    );
    const before = missing;
    missing = now;
    pruneCells((path) => exists(path) || !(now.has(path) && before.has(path)));
  }, [scannedAt, projects, pruneCells]);
}

let lastScan = 0;
let missing = new Set<string>();

interface Props {
  hidden: boolean;
  sessions: ClaudeSession[];
  projects: Map<string, WorkbenchProject>;
  busy: boolean;
  devServers: DevServer[];
  onStart: (path: string, resume?: string) => Promise<string | null>;
}

export function Wall({ hidden, sessions, projects, busy, devServers, onStart }: Props) {
  const layout = useWorkbenchStore((s) => s.layout);
  const cells = useWorkbenchStore((s) => s.cells);
  const focusCell = useWorkbenchStore((s) => s.focusCell);
  const seen = useWorkbenchStore((s) => s.seen);
  const setCells = useWorkbenchStore((s) => s.setCells);
  const pinCell = useWorkbenchStore((s) => s.pinCell);
  const touchCell = useWorkbenchStore((s) => s.touchCell);
  const activateCell = useWorkbenchStore((s) => s.activateCell);
  const moveTabToWallCell = useWorkbenchStore((s) => s.moveTabToWallCell);
  const setLayout = useWorkbenchStore((s) => s.setLayout);
  const tabs = useWorkbenchStore((s) => s.tabs);
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const [tick, setTick] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);
  const ready =
    useQuery({
      queryKey: ['workbench', 'sessions'],
      queryFn: listClaudeSessions,
      enabled: false,
    }).isSuccess && projects.size > 0;
  const count = CELL_COUNT[layout];
  usePruneCells(projects);

  useEffect(() => {
    void tick;
    const now = Date.now();
    const r = arrangeWall(cells, count, sessions, now, focusCell, seen, {
      tabsOf: (path) => tabs[path] ?? [],
      activeOf: (path) => activeTab[path],
      isFresh,
      ready,
    });
    if (r.changed) {
      setCells(r.cells);
      showUrgent(
        r.cells.filter((c) => r.moved.includes(c.id)),
        sessions,
        seen,
      );
    }
    if (hidden) return;
    const held = cells
      .slice(0, count)
      .map((c) => c.lastInputAt + HANDS_ON_MS - now)
      .filter((ms) => ms > 0);
    const delay = r.pendingCount > 0 ? HANDS_ON_MS : held.length ? Math.min(...held) + 50 : 0;
    if (!delay) return;
    const t = setTimeout(() => setTick((n) => n + 1), delay);
    return () => clearTimeout(t);
  }, [cells, count, sessions, seen, focusCell, setCells, tick, hidden, tabs, activeTab, ready]);

  const shown = cells.slice(0, count);
  const activeOf = (path: string) => activeTab[path];
  const keys = assignTabs(
    shown,
    (path) => tabs[path] ?? [],
    activeOf,
    wallPick(sessions, seen, activeOf),
  );
  const focusShown = shown.some((c) => c.id === focusCell);
  const fallbackFocus = (shown.find((c) => c.projectPath) ?? shown[0])?.id ?? null;
  useEffect(() => {
    if (!focusShown && fallbackFocus) useWorkbenchStore.setState({ focusCell: fallbackFocus });
  }, [focusShown, fallbackFocus]);
  const focused = shown.find((c) => c.id === focusCell)?.projectPath ?? null;
  const focusedProject = focused ? projects.get(focused) : undefined;
  const startIn = (id: string, path: string, resume?: string) =>
    void onStart(path, resume).then((key) => {
      if (key) activateCell(id, key);
    });
  const holdsPath = (c: WallCell, path: string | null) =>
    !!path && !!c.projectPath && samePath(c.projectPath, path);
  useEffect(() => {
    if (zoom && (zoom !== focusCell || count === 1)) setZoom(null);
  }, [zoom, focusCell, count]);
  const zoomed = zoom && count > 1 && zoom === focusCell ? zoom : null;
  const toggleZoom = (id: string) => setZoom((z) => (z === id ? null : id));

  return (
    <>
      {focusedProject && focusCell ? (
        <ProjectHeader
          project={focusedProject}
          server={devServers.find((d) => samePath(d.projectPath, focusedProject.path))}
          extra={
            <>
              <ModeSwitch />
              <LayoutPicker layout={layout} setLayout={setLayout} />
            </>
          }
        />
      ) : (
        <div className="wl-tb">
          <span className="wb-dim">Сюда встают сессии, которые ждут ответа</span>
          <span className="wb-gap" />
          <ModeSwitch />
          <LayoutPicker layout={layout} setLayout={setLayout} />
        </div>
      )}
      <div className={`wl-grid l-${zoomed ? '1x1' : layout}`}>
        {shown.map((c, i) => {
          const project = c.projectPath ? projects.get(c.projectPath) : undefined;
          const listed = (tabs[c.projectPath ?? ''] ?? []).length > 0;
          const twin =
            !keys[i] &&
            listed &&
            shown.some((o, j) => j !== i && !!keys[j] && holdsPath(o, c.projectPath));
          const quiet = !!project && !keys[i] && !twin;
          const solo = count === 1;
          const own = project
            ? sessions.filter((s) => s.projectPath && samePath(s.projectPath, project.path))
            : [];
          const status = topStatus(own, seen);
          const touch = () => {
            if (!c.projectPath || project) touchCell(c.id, keys[i] ?? undefined);
          };
          const lock = c.pinned ? 'pinned' : c.manual ? 'manual' : 'auto';
          const strip = !!project && !twin && !quiet;
          const isZoomed = zoomed === c.id;
          const chip = solo ? null : project ? (
            <span className={cn('wl-cp', strip && 'lead')} data-tip={project.path}>
              <ProjectIcon svg={project.icon} />
              <b>{project.name}</b>
            </span>
          ) : (
            <span className="wb-dim">Свободная ячейка</span>
          );
          const controls = solo ? null : (
            <>
              {count > 1 && (
                <button
                  type="button"
                  className="wl-pin"
                  data-tip={isZoomed ? 'Вернуть сетку' : 'Развернуть ячейку'}
                  aria-label={isZoomed ? 'Вернуть сетку' : 'Развернуть ячейку'}
                  onClick={() => toggleZoom(c.id)}
                >
                  {isZoomed ? <Minimize2 strokeWidth={2} /> : <Maximize2 strokeWidth={2} />}
                </button>
              )}
              <button
                type="button"
                className={cn('wl-pin', lock === 'pinned' && 'on', lock === 'manual' && 'half')}
                aria-pressed={lock !== 'auto'}
                data-tip={
                  lock === 'pinned'
                    ? 'Открепить ячейку'
                    : lock === 'manual'
                      ? 'Открыта вручную — вернуть авто-порядок'
                      : 'Закрепить ячейку'
                }
                aria-label={
                  lock === 'pinned'
                    ? 'Открепить ячейку'
                    : lock === 'manual'
                      ? 'Открыта вручную — вернуть авто-порядок'
                      : 'Закрепить ячейку'
                }
                onClick={() => pinCell(c.id)}
              >
                <Pin strokeWidth={2} />
              </button>
            </>
          );
          return (
            <WallCellZone
              key={c.id}
              cell={c}
              keys={tabs[c.projectPath ?? ''] ?? []}
              onDropTab={(tab, at) => moveTabToWallCell(c.id, tab.path, tab.key, at)}
              className={cn('wl-cell', status === 'waiting' && 'wait')}
              style={zoomed && !isZoomed ? { display: 'none' } : undefined}
              onPointerDownCapture={touch}
              onKeyDownCapture={touch}
              onWheelCapture={touch}
            >
              {(insertAt) => (
                <>
                  {!strip && !solo && (
                    <div className="wl-ch">
                      {chip}
                      {status === 'waiting' && (
                        <span className="wl-wait">
                          <StatusIcon small session={{ status, phase: null }} />
                          {STATUS_LABEL.waiting}
                        </span>
                      )}
                      <span className="wb-gap" />
                      {controls}
                    </div>
                  )}
                  <div className="wl-cb">
                    {!project && (
                      <div className="wl-free">
                        <span className="wb-dim">
                          Сюда встанет сессия, которая ждёт ответа или работает
                        </span>
                      </div>
                    )}
                    {strip && (
                      <Cell
                        lead={chip}
                        tail={controls}
                        onStripDoubleClick={count > 1 ? () => toggleZoom(c.id) : undefined}
                        key={project.path}
                        project={project}
                        sessions={sessions}
                        server={devServers.find((d) => samePath(d.projectPath, project.path))}
                        visible={!hidden}
                        focused={c.id === focusCell}
                        keys={keys[i] ? [keys[i]] : []}
                        activeKey={keys[i] ?? undefined}
                        onActivate={(key) => activateCell(c.id, key)}
                        busy={busy}
                        onStart={(resume) => onStart(project.path, resume)}
                        cellId={c.id}
                        insertAt={insertAt}
                        canAdd={false}
                      />
                    )}
                    {project && quiet && (
                      <EmptyProject
                        project={project}
                        server={devServers.find((d) => samePath(d.projectPath, project.path))}
                        visible={!hidden}
                        busy={busy}
                        onStart={(resume) => startIn(c.id, project.path, resume)}
                      />
                    )}
                    {project && twin && (
                      <div className="wl-twin">
                        <span className="wb-dim">Все вкладки проекта уже на экране</span>
                        <button
                          type="button"
                          className="wb-btn"
                          disabled={busy}
                          onClick={() => startIn(c.id, project.path)}
                        >
                          <Plus strokeWidth={2} />
                          Ещё сессия
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </WallCellZone>
          );
        })}
      </div>
    </>
  );
}
