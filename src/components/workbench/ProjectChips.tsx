import type { ClaudeSession, DevServer } from '@/lib/types';
import { byUrgency, effectiveStatus, runningItems } from '@/lib/workbench';
import { DevDot } from './DevCapsule';
import { StatusIcon } from './StatusIcon';

interface Props {
  sessions: ClaudeSession[];
  devServers: DevServer[];
  seen: Record<string, number>;
}

export function ProjectChips({ sessions, devServers, seen }: Props) {
  const top = byUrgency(sessions, seen)[0];
  const devs = runningItems([], devServers, seen).flatMap((i) =>
    i.kind === 'dev' ? [i.server] : [],
  );
  const dev = devs[0];
  if (!top && !dev) return null;
  const port = dev?.ports[0];
  return (
    <span className="wb-rt">
      {top && (
        <span className="wb-rc">
          <StatusIcon
            small
            session={{ status: effectiveStatus(top, seen), phase: top.phase, tool: top.tool }}
          />
          {sessions.length > 1 ? sessions.length : 'Claude'}
        </span>
      )}
      {dev && (
        <span className="wb-rc" title={dev.command}>
          <DevDot server={dev} />
          {devs.length > 1 ? devs.length : port ? `:${port}` : 'dev'}
        </span>
      )}
    </span>
  );
}
