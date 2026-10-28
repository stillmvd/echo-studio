import { useEffect, useMemo, useState } from 'react';
import { ContextMenuProvider, useContextMenu } from '@/components/ui/ContextMenu';
import { useClaudeSessions, useDevServers, useWorkbenchProjects } from '@/hooks/use-workbench';
import { cn } from '@/lib/cn';
import { places, samePath } from '@/lib/workbench';
import { useUiStore } from '@/state/ui-store';
import { useWorkbenchStore } from '@/state/workbench-store';
import { ProjectGrid } from './Cell';
import { MetricsBar } from './MetricsBar';
import { ModeSwitch } from './ModeSwitch';
import { ProjectHeader } from './ProjectHeader';
import { ProjectTree } from './ProjectTree';
import { QuickSwitch } from './QuickSwitch';
import { RunningList } from './RunningList';
import { TreeCard } from './TreeCard';
import { pruneMissing } from './terminals';
import { useEndedTabs, useStoppedDevTabs } from './useEndedTabs';
import { useStartSession } from './useStartSession';
import { useToasts } from './useToasts';
import { LayoutPicker, Wall } from './Wall';

export function WorkbenchLayout({ hidden }: { hidden: boolean }) {
  const { data: tree, error, dataUpdatedAt } = useWorkbenchProjects();
  const dashboard = useUiStore((s) => s.activeTab === 'dashboard');
  const sessions = useClaudeSessions(!hidden || dashboard);
  const live = useMemo(() => sessions.filter((s) => s.status !== 'exited'), [sessions]);
  const devServers = useDevServers();
  const view = useWorkbenchStore((s) => s.view);
  const tabs = useWorkbenchStore((s) => s.tabs);
  const { start, busy, dialogs } = useStartSession();
  const menu = useContextMenu();
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeQuery, setTreeQuery] = useState('');
  const hiddenProjects = useWorkbenchStore((s) => s.hiddenProjects);
  useEffect(() => {
    if (hidden) setTreeOpen(false);
  }, [hidden]);
  useEndedTabs(sessions);
  useStoppedDevTabs(devServers);

  const projects = useMemo(() => (tree ? places(tree) : []), [tree]);
  const byPath = useMemo(() => new Map(projects.map((p) => [p.path, p])), [projects]);
  useToasts(sessions, devServers, byPath);
  useEffect(() => {
    if (tree)
      pruneMissing(dataUpdatedAt, tabs, (path) => projects.some((p) => samePath(p.path, path)));
  }, [tree, dataUpdatedAt, projects, tabs]);
  const selected =
    view.kind === 'project' ? projects.find((p) => samePath(p.path, view.path)) : undefined;
  const select = useWorkbenchStore((s) => s.select);
  useEffect(() => {
    if (selected || !tree) return;
    const path =
      live.find((s) => s.projectPath)?.projectPath ?? projects.find((p) => !p.folder)?.path;
    if (path) select({ kind: 'project', path });
  }, [selected, tree, live, projects, select]);
  const mode = useWorkbenchStore((s) => s.mode);
  const projectLayouts = useWorkbenchStore((s) => s.projectLayouts);
  const setProjectLayout = useWorkbenchStore((s) => s.setProjectLayout);
  const wall = mode === 'wall' && !!selected;
  const opened = wall
    ? []
    : projects.filter((p) => (tabs[p.path]?.length ?? 0) > 0 || p === selected);

  return (
    <ContextMenuProvider value={menu.open}>
      <div className="wb-root" hidden={hidden}>
        <div className="wb-main">
          <div className="wb-card wb-side">
            <h2 className="wb-title">
              Рабочее <b>место</b>
            </h2>
            <div className={cn('wb-side-c', treeOpen && 'dim')} inert={treeOpen}>
              <div className="wb-sl">Запущено</div>
              <RunningList
                sessions={sessions}
                devServers={devServers}
                projects={byPath}
                busy={busy}
                onStart={(path) => void start(path)}
              />
            </div>
            <TreeCard
              open={treeOpen}
              onOpen={setTreeOpen}
              query={treeQuery}
              onQuery={setTreeQuery}
              current={selected}
              total={
                projects.filter(
                  (p) => !p.folder && !hiddenProjects.some((h) => samePath(h, p.path)),
                ).length
              }
            >
              {tree && (
                <ProjectTree
                  tree={tree}
                  devServers={devServers}
                  busy={busy}
                  onStart={(path) => void start(path)}
                  query={treeQuery}
                  onPick={() => setTreeOpen(false)}
                />
              )}
              {error && <p className="wb-dim px-3.5 py-2 text-xs">{String(error)}</p>}
            </TreeCard>
          </div>
          <div className="wb-card wb-pv">
            {wall && (
              <Wall
                hidden={hidden}
                sessions={live}
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
                      extra={
                        <>
                          <ModeSwitch />
                          <LayoutPicker
                            value={projectLayouts[p.path]?.layout ?? '1x1'}
                            onChange={(l) => setProjectLayout(p.path, l)}
                          />
                        </>
                      }
                    />
                  )}
                  <div
                    className="min-h-0 flex-1 flex-col"
                    style={{ display: isSelected ? 'flex' : 'none' }}
                  >
                    <ProjectGrid
                      project={p}
                      sessions={live}
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
        <MetricsBar sessions={sessions} projects={byPath} />
        <QuickSwitch enabled={!hidden} sessions={live} projects={byPath} />
        {dialogs}
        {menu.element}
      </div>
    </ContextMenuProvider>
  );
}
