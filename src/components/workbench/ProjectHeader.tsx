import { ArrowUp, GitBranch } from 'lucide-react';
import type { ReactNode } from 'react';
import { useGitStates } from '@/hooks/use-workbench-overview';
import { isStatus } from '@/lib/overview';
import type { DevServer, WorkbenchProject } from '@/lib/types';
import { DevCapsule } from './DevCapsule';
import { ProjectIcon } from './ProjectIcon';

interface Props {
  project: WorkbenchProject;
  server: DevServer | undefined;
  extra?: ReactNode;
}

export function ProjectHeader({ project, server, extra }: Props) {
  const git = useGitStates([project.path]).data?.[project.path];
  return (
    <div className="wb-ph">
      <ProjectIcon svg={project.icon} size="lg" />
      <span className="wb-pt">
        <b>{project.name}</b>
      </span>
      <span className="wb-gap" />
      {isStatus(git) && (
        <span className="wb-chip br">
          <GitBranch />
          <b>{git.branch}</b>
          {git.dirty > 0 && <i>±{git.dirty}</i>}
          {git.ahead > 0 && (
            <i>
              <ArrowUp className="h-3 w-3" />
              {git.ahead}
            </i>
          )}
        </span>
      )}
      {isStatus(git) && extra && <span className="wb-ph-sep" aria-hidden="true" />}
      {extra}
      {extra && project.dev && <span className="wb-ph-sep" aria-hidden="true" />}
      {project.dev && (
        <span className="wb-acts">
          <DevCapsule project={project} server={server} />
        </span>
      )}
    </div>
  );
}
