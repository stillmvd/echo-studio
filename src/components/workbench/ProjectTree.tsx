import { ChevronRight } from 'lucide-react';
import { useOpenMenu } from '@/components/ui/ContextMenu';
import { cn } from '@/lib/cn';
import { openInVscode, revealInExplorer } from '@/lib/ipc';
import type { DevServer, ProjectTree as Tree, WorkbenchProject } from '@/lib/types';
import { samePath } from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { useDevControl } from './DevCapsule';
import { copyText, projectMenu } from './menus';
import { ProjectIcon } from './ProjectIcon';

interface Props {
  tree: Tree;
  devServers: DevServer[];
  busy: boolean;
  onStart: (path: string) => void;
}

type RowMenu = (e: React.MouseEvent, project: WorkbenchProject) => void;

export function useProjectMenu(devServers: DevServer[], busy: boolean, onStart: Props['onStart']) {
  const select = useWorkbenchStore((s) => s.select);
  const hideProject = useWorkbenchStore((s) => s.hideProject);
  const openMenu = useOpenMenu();
  const dev = useDevControl();
  const menu: RowMenu = (e, p) =>
    openMenu(
      e,
      projectMenu({
        project: p,
        server: devServers.find((d) => samePath(d.projectPath, p.path)),
        busy,
        actions: {
          open: () => select({ kind: 'project', path: p.path }),
          newSession: () => onStart(p.path),
          startDev: () => dev.start(p.path),
          stopDev: () => dev.askStop(p),
          reveal: () => void revealInExplorer(p.path).catch(dev.fail('Проводник не открылся')),
          vscode: () => void openInVscode(p.path).catch(dev.fail('VS Code не открылся')),
          copyPath: () => copyText(p.path),
          hide: () => hideProject(p.path),
        },
      }),
    );
  return { menu, dev };
}

function ProjectRow({ project, menu }: { project: WorkbenchProject; menu: RowMenu }) {
  const view = useWorkbenchStore((s) => s.view);
  const select = useWorkbenchStore((s) => s.select);
  const on = view.kind === 'project' && view.path === project.path;
  return (
    <button
      type="button"
      className={cn('wb-tr', on && 'on')}
      title={project.path}
      onClick={() => select({ kind: 'project', path: project.path })}
      onContextMenu={(e) => menu(e, project)}
    >
      <ProjectIcon svg={project.icon} />
      <span className="wb-tn">
        <b>{project.name}</b>
      </span>
    </button>
  );
}

export function ProjectTree({ tree, devServers, busy, onStart }: Props) {
  const view = useWorkbenchStore((s) => s.view);
  const openGroups = useWorkbenchStore((s) => s.openGroups);
  const toggleGroup = useWorkbenchStore((s) => s.toggleGroup);
  const hidden = useWorkbenchStore((s) => s.hiddenProjects);
  const { menu, dev } = useProjectMenu(devServers, busy, onStart);
  const shown = (list: WorkbenchProject[]) =>
    hidden.length ? list.filter((p) => !hidden.some((h) => samePath(h, p.path))) : list;
  const folderMenu = (e: React.MouseEvent, path: string) => {
    const folder = tree.folders.find((f) => samePath(f.path, path));
    if (folder) menu(e, folder);
  };

  return (
    <fieldset
      className="wb-tree"
      aria-label="Проекты"
      onContextMenu={(e) => folderMenu(e, tree.root)}
    >
      {shown(tree.roots).map((p) => (
        <ProjectRow key={p.path} project={p} menu={menu} />
      ))}
      {tree.groups.map((g) => {
        const projects = shown(g.projects);
        const open = openGroups.includes(g.name);
        const here = view.kind === 'project' && samePath(view.path, g.path);
        return (
          <div key={g.name} className="contents">
            <button
              type="button"
              className={cn('wb-tr grp', open && 'open', here && 'on')}
              aria-expanded={open}
              onClick={() => toggleGroup(g.name)}
              onContextMenu={(e) => folderMenu(e, g.path)}
            >
              <ChevronRight className="wb-chev" strokeWidth={2} />
              {g.icon && <ProjectIcon svg={g.icon} />}
              <span className="wb-tn">
                <b>{g.name}</b>
              </span>
              <span className="wb-cnt">{projects.length}</span>
            </button>
            {open &&
              projects.map((p) => (
                <span key={p.path} className="wb-ind">
                  <ProjectRow project={p} menu={menu} />
                </span>
              ))}
          </div>
        );
      })}
      {dev.dialogs}
    </fieldset>
  );
}
