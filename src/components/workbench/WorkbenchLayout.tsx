import { useWorkbenchProjects } from '@/hooks/use-workbench';
import { all } from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { Overview } from './Overview';
import { ProjectIcon } from './ProjectIcon';
import { ProjectTree } from './ProjectTree';

export function WorkbenchLayout({ hidden }: { hidden: boolean }) {
  const { data: tree, error } = useWorkbenchProjects();
  const view = useWorkbenchStore((s) => s.view);
  const project =
    view.kind === 'project' && tree ? all(tree).find((p) => p.path === view.path) : undefined;

  return (
    <div className="wb-root" hidden={hidden}>
      <div className="wb-main">
        <div className="wb-card wb-side">
          <div className="wb-ch">
            <b>Проекты</b>
          </div>
          {tree && <ProjectTree tree={tree} />}
          {error && <p className="wb-runs-empty">{String(error)}</p>}
        </div>
        <div className="wb-card wb-pv">
          {project ? (
            <div className="wb-ph">
              <ProjectIcon svg={project.icon} size="lg" />
              <span className="wb-pt">
                <b>{project.name}</b>
                <span className="wb-path">{project.path}</span>
              </span>
            </div>
          ) : (
            <Overview />
          )}
        </div>
      </div>
    </div>
  );
}
