import type { ClaudeSession } from '@/lib/types';
import { byUrgency, effectiveStatus } from '@/lib/workbench';
import { StatusIcon } from './StatusIcon';

interface Props {
  sessions: ClaudeSession[];
  seen: Record<string, number>;
}

export function ProjectChips({ sessions, seen }: Props) {
  const top = byUrgency(sessions, seen)[0];
  if (!top) return null;
  return (
    <span className="wb-rt">
      <span className="wb-rc">
        <StatusIcon
          small
          session={{ status: effectiveStatus(top, seen), phase: top.phase, tool: top.tool }}
        />
        {sessions.length > 1 ? sessions.length : 'Claude'}
      </span>
    </span>
  );
}
