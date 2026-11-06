import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { emptyGrid, type Pane, splitEdges } from '@/lib/project-grid';
import type { ClaudeSession, DevServer, WorkbenchProject } from '@/lib/types';
import { CELL_COUNT, devHealth, samePath, topStatus } from '@/lib/workbench';
import { isDevTab, useWorkbenchStore } from '@/state/workbench-store';
import { Cell } from './Cell';
import { ModeSwitch } from './ModeSwitch';
import { ProjectHeader } from './ProjectHeader';
import { usePaneDrop } from './useTabDrag';
import { LayoutPicker } from './Wall';

const PANE_IDS = ['p0', 'p1', 'p2', 'p3'];

interface PaneProps {
  project: WorkbenchProject;
  pane: Pane;
  index: number;
  count: number;
  focused: boolean;
  zoomed: boolean;
  hiddenByZoom: boolean;
  hidden: boolean;
  busy: boolean;
  sessions: ClaudeSession[];
  server: DevServer | undefined;
  onStart: (path: string, resume?: string) => Promise<string | null>;
  onZoom: () => void;
}

function PaneView({
  project,
  pane,
  index,
  count,
  focused,
  zoomed,
  hiddenByZoom,
  hidden,
  busy,
  sessions,
  server,
  onStart,
  onZoom,
}: PaneProps) {
  const path = project.path;
  const layout = useWorkbenchStore((s) => s.grids[path]?.layout ?? '1x1');
  const activatePane = useWorkbenchStore((s) => s.activatePane);
  const focusPane = useWorkbenchStore((s) => s.focusPane);
  const moveTab = useWorkbenchStore((s) => s.moveTab);
  const splitTab = useWorkbenchStore((s) => s.splitTab);
  const seen = useWorkbenchStore((s) => s.seen);
  const cellId = PANE_IDS[index] ?? `p${index}`;
  const devShown = devHealth(server) !== 'stopped';
  const shown = pane.tabs.filter((k) => devShown || !isDevTab(k));
  const fullIndex = (at: number | undefined) => {
    if (at === undefined) return undefined;
    const key = shown[at];
    return key === undefined ? pane.tabs.length : pane.tabs.indexOf(key);
  };
  const drop = usePaneDrop({
    path,
    cell: cellId,
    keys: shown,
    edges: zoomed ? [] : splitEdges(layout),
    onDrop: (tab, at, edge) => {
      if (edge) splitTab(path, tab.key, index, edge);
      else moveTab(path, tab.key, index, fullIndex(at));
    },
  });
  const own = sessions.filter((s) => pane.tabs.includes(s.sessionId));
  const waiting = !focused && topStatus(own, seen) === 'waiting';
  const touch = () => focusPane(path, index, pane.active);
  const tail =
    count > 1 ? (
      <button
        type="button"
        className="wl-pin"
        data-tip={zoomed ? 'Вернуть сетку' : 'Развернуть ячейку'}
        aria-label={zoomed ? 'Вернуть сетку' : 'Развернуть ячейку'}
        onClick={onZoom}
      >
        {zoomed ? <Minimize2 strokeWidth={2} /> : <Maximize2 strokeWidth={2} />}
      </button>
    ) : null;
  return (
    <div
      className={cn('wl-cell', waiting && 'wait', drop.hover.center && 'drop')}
      style={hiddenByZoom ? { display: 'none' } : undefined}
      onPointerDownCapture={touch}
      onKeyDownCapture={touch}
      {...drop.props}
    >
      <div className="wl-cb">
        <Cell
          project={project}
          sessions={sessions}
          server={server}
          visible={!hidden && !hiddenByZoom}
          focused={focused}
          keys={pane.tabs}
          activeKey={pane.active}
          onActivate={(key) => activatePane(path, index, key)}
          busy={busy}
          onStart={(resume) => onStart(path, resume)}
          cellId={cellId}
          insertAt={drop.hover.insert}
          moveTargets={(key) =>
            count > 1 ? { count, current: index, move: (j) => moveTab(path, key, j) } : null
          }
          tail={tail}
          onStripDoubleClick={count > 1 ? onZoom : undefined}
        />
      </div>
      {drop.hover.edge && <span className={`wl-split ${drop.hover.edge}`} aria-hidden="true" />}
    </div>
  );
}

interface Props {
  project: WorkbenchProject;
  hidden: boolean;
  sessions: ClaudeSession[];
  busy: boolean;
  devServers: DevServer[];
  onStart: (path: string, resume?: string) => Promise<string | null>;
}

export function ProjectScreen({ project, hidden, sessions, busy, devServers, onStart }: Props) {
  const path = project.path;
  const grid = useWorkbenchStore((s) => s.grids[path]) ?? emptyGrid();
  const setGridLayout = useWorkbenchStore((s) => s.setGridLayout);
  const [zoom, setZoom] = useState<number | null>(null);
  const count = CELL_COUNT[grid.layout];
  useEffect(() => {
    if (zoom !== null && (zoom !== grid.focus || count === 1)) setZoom(null);
  }, [zoom, grid.focus, count]);
  const zoomed = zoom !== null && count > 1 && zoom === grid.focus ? zoom : null;
  const server = devServers.find((d) => samePath(d.projectPath, path));
  return (
    <>
      <ProjectHeader
        project={project}
        server={server}
        extra={
          <>
            <ModeSwitch />
            <LayoutPicker layout={grid.layout} setLayout={(l) => setGridLayout(path, l)} />
          </>
        }
      />
      <div className={`wl-grid l-${zoomed !== null ? '1x1' : grid.layout}`}>
        {grid.panes.slice(0, count).map((pane, i) => (
          <PaneView
            key={PANE_IDS[i]}
            project={project}
            pane={pane}
            index={i}
            count={count}
            focused={grid.focus === i}
            zoomed={zoomed === i}
            hiddenByZoom={zoomed !== null && zoomed !== i}
            hidden={hidden}
            busy={busy}
            sessions={sessions}
            server={server}
            onStart={onStart}
            onZoom={() => setZoom((z) => (z === i ? null : i))}
          />
        ))}
      </div>
    </>
  );
}
