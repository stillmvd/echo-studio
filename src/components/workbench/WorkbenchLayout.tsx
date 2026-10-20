import { useMemo } from 'react';
import { useClaudeSessions, useWorkbenchProjects } from '@/hooks/use-workbench';
import { all, samePath } from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { Cell } from './Cell';
import { Overview } from './Overview';
import { ProjectHeader } from './ProjectHeader';
import { ProjectTree } from './ProjectTree';
import { useStartSession } from './useStartSession';

export function WorkbenchLayout({ hidden }: { hidden: boolean }) {
  const { data: tree, error } = useWorkbenchProjects();
  const sessions = useClaudeSessions(!hidden);
  const view = useWorkbenchStore((s) => s.view);
  const tabs = useWorkbenchStore((s) => s.tabs);
  const { start, busy, dialogs } = useStartSession();

  const projects = useMemo(() => (tree ? all(tree) : []), [tree]);
  const selected =
    view.kind === 'project' ? projects.find((p) => samePath(p.path, view.path)) : undefined;
  const opened = projects.filter((p) => (tabs[p.path]?.length ?? 0) > 0 || p === selected);

  return (
    <div className="wb-root" hidden={hidden}>
      <div className="wb-main">
        <div className="wb-card wb-side">
          <div className="wb-ch">
            <b>Проекты</b>
          </div>
          {tree && <ProjectTree tree={tree} />}
          {error && <p className="wb-dim px-3 py-2 text-[12.5px]">{String(error)}</p>}
        </div>
        <div className="wb-card wb-pv">
          {!selected && <Overview />}
          {opened.map((p) => {
            const isSelected = p === selected;
            return (
              <div key={p.path} className="contents">
                {isSelected && (
                  <ProjectHeader project={p} busy={busy} onClaude={() => void start(p.path)} />
                )}
                <div
                  className="min-h-0 flex-1 flex-col"
                  style={{ display: isSelected ? 'flex' : 'none' }}
                >
                  <Cell
                    project={p}
                    sessions={sessions}
                    visible={!hidden && isSelected}
                    busy={busy}
                    onStart={(resume) => void start(p.path, resume)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {dialogs}
    </div>
  );
}
