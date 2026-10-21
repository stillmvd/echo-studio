import { useQuery } from '@tanstack/react-query';
import { Columns2, Grid2x2, Pin, Plus, Square } from 'lucide-react';
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
  value,
  onChange,
}: {
  value?: WallLayout;
  onChange?: (layout: WallLayout) => void;
}) {
  const wallLayout = useWorkbenchStore((s) => s.layout);
  const setWallLayout = useWorkbenchStore((s) => s.setLayout);
  const layout = value ?? wallLayout;
  const setLayout = onChange ?? setWallLayout;
  return (
    <fieldset className="wl-seg" aria-label="Раскладка проекта">
      {LAYOUTS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={key === layout}
          aria-label={`Раскладка ${label}`}
          title={`Раскладка ${label}`}
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
  useWorkbenchStore.setState((s) => {
    const tabs = { ...s.tabs };
    const activeTab = { ...s.activeTab };
    const picked = new Map<string, string>();
    for (const c of moved) {
      if (!c.projectPath) continue;
      const path = c.projectPath;
      const key = c.activeTab ?? urgentTab(sessions, path, seen);
      if (!key) continue;
      const list = tabs[path] ?? [];
      tabs[path] = list.includes(key) ? list : [...list, key];
      activeTab[path] = key;
      picked.set(c.id, key);
    }
    const cells = s.cells.map((c) =>
      moved.some((m) => m.id === c.id) ? { ...c, activeTab: picked.get(c.id) ?? c.activeTab } : c,
    );
    return { tabs, activeTab, cells };
  });
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
  const tabs = useWorkbenchStore((s) => s.tabs);
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const [tick, setTick] = useState(0);
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
  const focused = cells.find((c) => c.id === focusCell)?.projectPath ?? null;
  const startIn = (id: string, path: string, resume?: string) =>
    void onStart(path, resume).then((key) => {
      if (key) activateCell(id, key);
    });
  const holdsPath = (c: WallCell, path: string | null) =>
    !!path && !!c.projectPath && samePath(c.projectPath, path);

  return (
    <>
      <div className="wl-tb">
        <b>Пульт</b>
        <span className="wb-dim">
          Ячейки занимают ждущие и работающие, <Pin className="wl-in" strokeWidth={2} /> держит
          ячейку
        </span>
        <span className="wb-gap" />
        <ModeSwitch />
        <LayoutPicker />
        <button
          type="button"
          className="wb-btn p"
          disabled={busy || !focused}
          onClick={() => focused && focusCell && startIn(focusCell, focused)}
        >
          <Plus strokeWidth={2} />
          Claude
        </button>
      </div>
      <div className={`wl-grid l-${layout}`}>
        {shown.map((c, i) => {
          const project = c.projectPath ? projects.get(c.projectPath) : undefined;
          const listed = (tabs[c.projectPath ?? ''] ?? []).length > 0;
          const twin =
            !keys[i] &&
            listed &&
            shown.some((o, j) => j !== i && !!keys[j] && holdsPath(o, c.projectPath));
          const quiet = !keys[i] && listed && !twin;
          const own = project
            ? sessions.filter((s) => s.projectPath && samePath(s.projectPath, project.path))
            : [];
          const status = topStatus(own, seen);
          const touch = () => {
            if (!c.projectPath || project) touchCell(c.id, keys[i] ?? undefined);
          };
          const lock = c.pinned ? 'pinned' : c.manual ? 'manual' : 'auto';
          return (
            <WallCellZone
              key={c.id}
              cell={c}
              keys={tabs[c.projectPath ?? ''] ?? []}
              onDropTab={(tab, at) => moveTabToWallCell(c.id, tab.path, tab.key, at)}
              className={cn('wl-cell', status === 'waiting' && 'wait')}
              onPointerDownCapture={touch}
              onKeyDownCapture={touch}
              onWheelCapture={touch}
            >
              {(insertAt) => (
                <>
                  <div className="wl-ch">
                    {project ? (
                      <span className="wl-cp" title={project.path}>
                        <ProjectIcon svg={project.icon} />
                        <b>{project.name}</b>
                      </span>
                    ) : (
                      <span className="wb-dim">Свободная ячейка</span>
                    )}
                    {status === 'waiting' && (
                      <span className="wl-wait">
                        <StatusIcon small session={{ status, phase: null, tool: null }} />
                        {STATUS_LABEL.waiting}
                      </span>
                    )}
                    <span className="wb-gap" />
                    <button
                      type="button"
                      className={cn(
                        'wl-pin',
                        lock === 'pinned' && 'on',
                        lock === 'manual' && 'half',
                      )}
                      aria-pressed={lock !== 'auto'}
                      title={
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
                  </div>
                  <div className="wl-cb">
                    {project && !twin && !quiet && (
                      <Cell
                        key={project.path}
                        project={project}
                        sessions={sessions}
                        server={devServers.find((d) => samePath(d.projectPath, project.path))}
                        visible={!hidden}
                        focused={c.id === focusCell}
                        activeKey={keys[i] ?? undefined}
                        onActivate={(key) => activateCell(c.id, key)}
                        busy={busy}
                        onStart={(resume) => onStart(project.path, resume)}
                        cellId={c.id}
                        insertAt={insertAt}
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
