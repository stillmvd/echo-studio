import { ArrowUp, GitBranch, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { ChromeIcon } from '@/components/ui/ChromeIcon';
import { useGitStates } from '@/hooks/use-workbench-overview';
import { isStatus } from '@/lib/overview';
import type { DevServer, WorkbenchProject } from '@/lib/types';
import { shortPath } from '@/lib/workbench';
import { DevCapsule } from './DevCapsule';
import { ProjectIcon } from './ProjectIcon';

interface Props {
  project: WorkbenchProject;
  server: DevServer | undefined;
  busy: boolean;
  onClaude: () => void;
  extra?: ReactNode;
}

export function ProjectHeader({ project, server, busy, onClaude, extra }: Props) {
  const git = useGitStates([project.path]).data?.[project.path];
  return (
    <div className="wb-ph">
      <ProjectIcon svg={project.icon} size="lg" />
      <span className="wb-pt">
        <b title={project.name}>{project.name}</b>
        <span className="wb-path" title={project.path}>
          {shortPath(project.path)}
        </span>
      </span>
      <span className="wb-chips">
        {isStatus(git) && (
          <span className="wb-chip" title="Ветка, незакоммиченное, незапушенное">
            <GitBranch />
            {git.branch}
            {git.dirty > 0 && <i>±{git.dirty}</i>}
            {git.ahead > 0 && (
              <i>
                <ArrowUp className="h-3 w-3" />
                {git.ahead}
              </i>
            )}
          </span>
        )}
        {project.mcp && (
          <span className="wb-chip" title="Профиль chrome-devtools MCP">
            <ChromeIcon />
            {project.mcp.profile ?? 'общий профиль'}
            <i>{project.mcp.headless ? 'фоновый' : 'видимый'}</i>
          </span>
        )}
      </span>
      <span className="wb-gap" />
      {extra}
      {extra && <span className="wb-ph-sep" aria-hidden="true" />}
      <span className="wb-acts">
        <DevCapsule project={project} server={server} />
        <button
          type="button"
          className="wb-btn p"
          title="Новая сессия Claude"
          disabled={busy}
          onClick={onClaude}
        >
          <Plus strokeWidth={2} />
          <span className="wb-btn-l">Claude</span>
        </button>
      </span>
    </div>
  );
}
