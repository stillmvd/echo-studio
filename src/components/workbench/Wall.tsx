import { useQuery } from '@tanstack/react-query';
import { Columns2, Grid2x2, Pin, Plus, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { listWorkbenchProjects } from '@/lib/ipc';
import type { ClaudeSession, DevServer, WorkbenchProject } from '@/lib/types';
import {
  arrangeCells,
  assignTabs,
  byUrgency,
  CELL_COUNT,
  HANDS_ON_MS,
  STATUS_LABEL,
  samePath,
  topStatus,
  type WallCell,
  type WallLayout,
} from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { Cell } from './Cell';
import { ProjectIcon } from './ProjectIcon';
import { StatusIcon } from './StatusIcon';

const LAYOUTS: { key: WallLayout; label: string; Icon: typeof Square }[] = [
  { key: '1x1', label: '1×1', Icon: Square },
  { key: '2x1', label: '2×1', Icon: Columns2 },
  { key: '2x2', label: '2×2', Icon: Grid2x2 },
];

export function LayoutPicker() {
  const layout = useWorkbenchStore((s) => s.layout);
  const setLayout = useWorkbenchStore((s) => s.setLayout);
  return (
    <fieldset className="wl-seg" aria-label="Раскладка">
      {LAYOUTS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={key === layout}
          aria-label={`Раскладка ${label}`}
          title={label}
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
      const top = byUrgency(
        sessions.filter(
          (x) => x.kind === 'shell' && x.projectPath && samePath(x.projectPath, path),
        ),
        seen,
      )[0];
      if (!top) continue;
      const list = tabs[path] ?? [];
      tabs[path] = list.includes(top.sessionId) ? list : [...list, top.sessionId];
      activeTab[path] = top.sessionId;
      picked.set(c.id, top.sessionId);
    }
    const cells = s.cells.map((c) =>
      moved.some((m) => m.id === c.id) ? { ...c, activeTab: picked.get(c.id) } : c,
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
  const missing = useRef(new Set<string>());

  useEffect(() => {
    if (!scannedAt) return;
    const exists = (path: string) => [...projects.keys()].some((p) => samePath(p, path));
    const now = new Set(
      useWorkbenchStore
        .getState()
        .cells.flatMap((c) => (c.projectPath && !exists(c.projectPath) ? [c.projectPath] : [])),
    );
    const before = missing.current;
    missing.current = now;
    pruneCells((path) => exists(path) || !(now.has(path) && before.has(path)));
  }, [scannedAt, projects, pruneCells]);
}

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
  const tabs = useWorkbenchStore((s) => s.tabs);
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const [tick, setTick] = useState(0);
  const count = CELL_COUNT[layout];
  usePruneCells(projects);

  useEffect(() => {
    void tick;
    const r = arrangeCells(cells.slice(0, count), sessions, Date.now(), focusCell, seen);
    if (r.moved.length > 0) {
      setCells([...r.cells, ...cells.slice(count)]);
      showUrgent(
        r.cells.filter((c) => r.moved.includes(c.id)),
        sessions,
        seen,
      );
    }
    if (r.pendingCount === 0 || hidden) return;
    const t = setTimeout(() => setTick((n) => n + 1), HANDS_ON_MS);
    return () => clearTimeout(t);
  }, [cells, count, sessions, seen, focusCell, setCells, tick, hidden]);

  const shown = cells.slice(0, count);
  const keys = assignTabs(
    shown,
    (path) => tabs[path] ?? [],
    (path) => activeTab[path],
  );
  const focused = cells.find((c) => c.id === focusCell)?.projectPath ?? null;

  return (
    <>
      <div className="wl-tb">
        <b>Пульт</b>
        <span className="wb-dim">
          Ячейки занимают ждущие и работающие, <Pin className="wl-in" strokeWidth={2} /> держит
          ячейку
        </span>
        <span className="wb-gap" />
        <LayoutPicker />
        <button
          type="button"
          className="wb-btn p"
          disabled={busy || !focused}
          onClick={() => focused && void onStart(focused)}
        >
          <Plus strokeWidth={2} />
          Claude
        </button>
      </div>
      <div className={`wl-grid l-${layout}`}>
        {shown.map((c, i) => {
          const project = c.projectPath ? projects.get(c.projectPath) : undefined;
          const twin = shown
            .slice(0, i)
            .some((o) => o.projectPath && c.projectPath && samePath(o.projectPath, c.projectPath));
          const own = project
            ? sessions.filter((s) => s.projectPath && samePath(s.projectPath, project.path))
            : [];
          const status = topStatus(own, seen);
          const touch = () => {
            if (!c.projectPath || project) touchCell(c.id);
          };
          const lock = c.pinned ? 'pinned' : c.manual ? 'manual' : 'auto';
          return (
            <div
              key={c.id}
              className={cn('wl-cell', status === 'waiting' && 'wait')}
              onPointerDownCapture={touch}
              onKeyDownCapture={touch}
              onWheelCapture={touch}
            >
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
                  className={cn('wl-pin', lock === 'pinned' && 'on', lock === 'manual' && 'half')}
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
                {project && !twin && (
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
                  />
                )}
                {project && twin && (
                  <div className="wl-twin">
                    <span className="wb-dim">Проект уже открыт в соседней ячейке</span>
                    <button
                      type="button"
                      className="wb-btn"
                      disabled={busy}
                      onClick={() => void onStart(project.path)}
                    >
                      <Plus strokeWidth={2} />
                      Ещё сессия
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
