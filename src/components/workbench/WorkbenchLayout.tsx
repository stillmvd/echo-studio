import { useEffect, useMemo } from 'react';
import { useClaudeSessions, useDevServers, useWorkbenchProjects } from '@/hooks/use-workbench';
import { all, samePath } from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { Cell } from './Cell';
import { Overview } from './Overview';
import { ProjectChips } from './ProjectChips';
import { ProjectHeader } from './ProjectHeader';
import { ProjectTree } from './ProjectTree';
import { QuickSwitch } from './QuickSwitch';
import { RunningList } from './RunningList';
import { SessionStrip } from './SessionStrip';
import { pruneMissing } from './terminals';
import { useStartSession } from './useStartSession';
import { LayoutPicker, Wall } from './Wall';

export function WorkbenchLayout({ hidden }: { hidden: boolean }) {
  const { data: tree, error, dataUpdatedAt } = useWorkbenchProjects();
  const sessions = useClaudeSessions(!hidden);
  const devServers = useDevServers();
  const view = useWorkbenchStore((s) => s.view);
  const tabs = useWorkbenchStore((s) => s.tabs);
  const { start, busy, dialogs } = useStartSession();

  const seen = useWorkbenchStore((s) => s.seen);
  const projects = useMemo(() => (tree ? all(tree) : []), [tree]);
  const byPath = useMemo(() => new Map(projects.map((p) => [p.path, p])), [projects]);
  useEffect(() => {
    if (tree)
      pruneMissing(dataUpdatedAt, tabs, (path) => projects.some((p) => samePath(p.path, path)));
  }, [tree, dataUpdatedAt, projects, tabs]);
  const selected =
    view.kind === 'project' ? projects.find((p) => samePath(p.path, view.path)) : undefined;
  const layout = useWorkbenchStore((s) => s.layout);
  const wall = layout !== '1x1' && !!selected;
  const opened = wall
    ? []
    : projects.filter((p) => (tabs[p.path]?.length ?? 0) > 0 || p === selected);

  return (
    <div className="wb-root" hidden={hidden}>
      <div className="wb-main">
        <div className="wb-card wb-side">
          <div className="wb-ch">
            <b>Запущено</b>
          </div>
          <RunningList sessions={sessions} devServers={devServers} projects={byPath} />
          <div className="wb-ch sub">
            <b>Проекты</b>
          </div>
          {tree && (
            <ProjectTree
              tree={tree}
              tail={(paths) => {
                const inside = (path: string | null) =>
                  !!path && paths.some((p) => samePath(p, path));
                const own = sessions.filter((s) => inside(s.projectPath));
                const devs = devServers.filter(
                  (d) => d.state !== 'stopped' && inside(d.projectPath),
                );
                if (own.length === 0 && devs.length === 0) return null;
                return <ProjectChips sessions={own} devServers={devs} seen={seen} />;
              }}
            />
          )}
          {error && <p className="wb-dim px-3 py-2 text-[12.5px]">{String(error)}</p>}
        </div>
        <div className="wb-card wb-pv">
          {!selected && <Overview />}
          {wall && (
            <Wall
              hidden={hidden}
              sessions={sessions}
              projects={byPath}
              busy={busy}
              devServers={devServers}
              onStart={start}
            />
          )}
          {opened.map((p) => {
            const isSelected = p === selected;
            return (
              <div key={p.path} className="contents">
                {isSelected && (
                  <ProjectHeader
                    project={p}
                    server={devServers.find((d) => samePath(d.projectPath, p.path))}
                    busy={busy}
                    onClaude={() => void start(p.path)}
                    extra={<LayoutPicker />}
                  />
                )}
                <div
                  className="min-h-0 flex-1 flex-col"
                  style={{ display: isSelected ? 'flex' : 'none' }}
                >
                  <Cell
                    project={p}
                    sessions={sessions}
                    server={devServers.find((d) => samePath(d.projectPath, p.path))}
                    visible={!hidden && isSelected}
                    busy={busy}
                    onStart={(resume) => start(p.path, resume)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <SessionStrip sessions={sessions} projects={byPath} wall={wall} />
      <QuickSwitch enabled={!hidden} sessions={sessions} projects={byPath} />
      {dialogs}
    </div>
  );
}
