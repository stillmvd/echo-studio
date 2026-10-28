import { ChevronRight } from 'lucide-react';
import { Highlight } from '@/components/memory/MemoryRows';
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
  query: string;
  onPick: () => void;
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

function ProjectRow({
  project,
  menu,
  query,
  onPick,
}: {
  project: WorkbenchProject;
  menu: RowMenu;
  query: string;
  onPick: () => void;
}) {
  const view = useWorkbenchStore((s) => s.view);
  const select = useWorkbenchStore((s) => s.select);
  const on = view.kind === 'project' && view.path === project.path;
  return (
    <button
      type="button"
      className={cn('wb-tr', on && 'on')}
      title={project.path}
      onClick={() => {
        select({ kind: 'project', path: project.path });
        onPick();
      }}
      onContextMenu={(e) => menu(e, project)}
    >
      <ProjectIcon svg={project.icon} />
      <span className="wb-tn">
        <b>
          <Highlight text={project.name} query={query} />
        </b>
      </span>
    </button>
  );
}

export function ProjectTree({ tree, devServers, busy, onStart, query, onPick }: Props) {
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
  const q = query.trim().toLowerCase();
  const hit = (name: string) => name.toLowerCase().includes(q);
  const roots = shown(tree.roots).filter((p) => hit(p.name));
  const groups = tree.groups.flatMap((g) => {
    const all = shown(g.projects);
    const found = q ? all.filter((p) => hit(p.name)) : [];
    if (q && !found.length && !hit(g.name)) return [];
    const auto = found.length > 0 || (q !== '' && hit(g.name));
    return [{ g, projects: auto && !hit(g.name) ? found : all, auto }];
  });

  return (
    <div className="wb-tree-sc">
      <fieldset
        className="wb-tree"
        aria-label="Проекты"
        onContextMenu={(e) => folderMenu(e, tree.root)}
      >
        {roots.map((p) => (
          <ProjectRow key={p.path} project={p} menu={menu} query={q} onPick={onPick} />
        ))}
        {groups.map(({ g, projects, auto }) => {
          const open = auto || openGroups.includes(g.name);
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
                  <b>
                    <Highlight text={g.name} query={q} />
                  </b>
                </span>
                <span className="wb-cnt">{projects.length}</span>
              </button>
              {open &&
                projects.map((p) => (
                  <span key={p.path} className="wb-ind">
                    <ProjectRow project={p} menu={menu} query={q} onPick={onPick} />
                  </span>
                ))}
            </div>
          );
        })}
        {q && !roots.length && !groups.length && (
          <p className="wb-dim px-3.5 py-2 text-xs">Ничего не найдено</p>
        )}
        {dev.dialogs}
      </fieldset>
    </div>
  );
}
