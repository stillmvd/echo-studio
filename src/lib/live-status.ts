import type { ClaudeSession, DevServer } from './types';
import { devHealth, type StatusView } from './workbench';

export type LiveLook =
  | 'idle'
  | 'still'
  | 'thinking'
  | 'tool'
  | 'agents'
  | 'waiting'
  | 'done'
  | 'error'
  | 'dev_run'
  | 'dev_slow'
  | 'dev_err'
  | 'dev_down';

export const LIVE_COLOR: Record<LiveLook, string> = {
  idle: '#8b919c',
  still: '#8b919c',
  thinking: '#b39dff',
  tool: '#4d94ff',
  agents: '#4d94ff',
  waiting: '#ffc21a',
  done: '#3ddc84',
  error: '#ff5a5f',
  dev_run: '#2fd3b0',
  dev_slow: '#2fd3b0',
  dev_err: '#ffa53a',
  dev_down: '#ff5a5f',
};

export function sessionLook(s: { status: StatusView; phase: ClaudeSession['phase'] }): LiveLook {
  switch (s.status) {
    case 'working':
      return s.phase === 'tool' ? 'tool' : s.phase === 'agents' ? 'agents' : 'thinking';
    case 'waiting':
    case 'done':
    case 'error':
      return s.status;
    case 'exited':
      return 'still';
    case 'idle':
    case 'new':
      return 'idle';
  }
}

export function devLook(server: DevServer | undefined): LiveLook {
  switch (devHealth(server)) {
    case 'crashed':
      return 'dev_down';
    case 'errors':
      return 'dev_err';
    case 'running':
      return 'dev_run';
    case 'starting':
      return 'dev_slow';
    default:
      return 'still';
  }
}
