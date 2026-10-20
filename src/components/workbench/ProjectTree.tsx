import { ChevronRight, LayoutDashboard } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { ProjectTree as Tree, WorkbenchProject } from '@/lib/types';
import { useWorkbenchStore } from '@/state/workbench-store';
import { ProjectIcon } from './ProjectIcon';

interface Props {
  tree: Tree;
  tail?: (paths: string[]) => ReactNode;
}

function ProjectRow({ project, tail }: { project: WorkbenchProject; tail?: Props['tail'] }) {
  const view = useWorkbenchStore((s) => s.view);
  const select = useWorkbenchStore((s) => s.select);
  const on = view.kind === 'project' && view.path === project.path;
  return (
    <button
      type="button"
      className={cn('wb-tr', on && 'on')}
      title={project.path}
      onClick={() => select({ kind: 'project', path: project.path })}
    >
      <ProjectIcon svg={project.icon} />
      <span className="wb-tn">
        <b>{project.name}</b>
      </span>
      {tail?.([project.path])}
    </button>
  );
}

export function ProjectTree({ tree, tail }: Props) {
  const view = useWorkbenchStore((s) => s.view);
  const select = useWorkbenchStore((s) => s.select);
  const openGroups = useWorkbenchStore((s) => s.openGroups);
  const toggleGroup = useWorkbenchStore((s) => s.toggleGroup);

  return (
    <div className="wb-tree">
      <button
        type="button"
        className={cn('wb-tr', view.kind === 'overview' && 'on')}
        onClick={() => select({ kind: 'overview' })}
      >
        <span className="wb-pi none">
          <LayoutDashboard strokeWidth={1.75} />
        </span>
        <span className="wb-tn">
          <b>Обзор</b>
        </span>
      </button>
      {tree.roots.map((p) => (
        <ProjectRow key={p.path} project={p} tail={tail} />
      ))}
      {tree.groups.map((g) => {
        const open = openGroups.includes(g.name);
        const chips = open ? null : tail?.(g.projects.map((p) => p.path));
        return (
          <div key={g.name} className="contents">
            <button
              type="button"
              className={cn('wb-tr grp', open && 'open')}
              aria-expanded={open}
              onClick={() => toggleGroup(g.name)}
            >
              <ChevronRight className="wb-chev" strokeWidth={2} />
              {g.icon && <ProjectIcon svg={g.icon} />}
              <span className="wb-tn">
                <b>{g.name}</b>
              </span>
              {chips || <span className="wb-cnt">{g.projects.length}</span>}
            </button>
            {open &&
              g.projects.map((p) => (
                <span key={p.path} className="wb-ind">
                  <ProjectRow project={p} tail={tail} />
                </span>
              ))}
          </div>
        );
      })}
    </div>
  );
}
