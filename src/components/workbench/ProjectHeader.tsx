import { ArrowUp, GitBranch, Globe, Plus } from 'lucide-react';
import { useGitStates } from '@/hooks/use-workbench-overview';
import { isStatus } from '@/lib/overview';
import type { WorkbenchProject } from '@/lib/types';
import { shortPath } from '@/lib/workbench';
import { ProjectIcon } from './ProjectIcon';

interface Props {
  project: WorkbenchProject;
  busy: boolean;
  onClaude: () => void;
}

export function ProjectHeader({ project, busy, onClaude }: Props) {
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
      <span className="wb-gap" />
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
            <Globe />
            {project.mcp.profile ?? 'общий профиль'}
            <i>{project.mcp.headless ? 'фоновый' : 'видимый'}</i>
          </span>
        )}
      </span>
      <button type="button" className="wb-btn p" disabled={busy} onClick={onClaude}>
        <Plus strokeWidth={2} />
        Claude
      </button>
    </div>
  );
}
