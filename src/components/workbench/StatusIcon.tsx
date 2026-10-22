import { sessionLook } from '@/lib/live-status';
import type { ClaudeSession } from '@/lib/types';
import { type StatusView, statusTitle } from '@/lib/workbench';
import { LiveIcon } from './live/LiveIcon';

type Shown = Pick<ClaudeSession, 'phase'> & { status: StatusView };

export function StatusIcon({
  session,
  small,
  seed,
}: {
  session: Shown;
  small?: boolean;
  seed?: string;
}) {
  return (
    <LiveIcon
      look={sessionLook(session)}
      size={small ? 18 : 22}
      title={statusTitle(session.status)}
      className={small ? 'wb-gl sm' : 'wb-gl'}
      seed={seed}
    />
  );
}
