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

export type FlatLook = 'dev_err' | 'dev_down';
export type SolidLook = Exclude<LiveLook, FlatLook>;

export const FLAT_VIEWBOX: Record<FlatLook, string> = {
  dev_err: '-15 -15 30 30',
  dev_down: '-13.24 -13.24 26.47 26.47',
};

export const SOLID_SCALE: Record<SolidLook, number> = {
  idle: 1.208,
  still: 1.208,
  thinking: 0.788,
  tool: 0.806,
  agents: 1.056,
  waiting: 1.109,
  done: 1.068,
  error: 1.109,
  dev_run: 0.9,
  dev_slow: 0.9,
};

export const isFlat = (look: LiveLook): look is FlatLook => look in FLAT_VIEWBOX;

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

const GLOW_SPOTS = [
  [20, 30],
  [80, 70],
  [75, 20],
  [25, 80],
  [50, 50],
  [50, 12],
  [12, 55],
  [88, 45],
] as const;

export function sweepDelay(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ((h % 500) / 100).toFixed(2);
}

export function cardGlow(colors: string[]): string {
  const unique = [...new Set(colors)];
  if (unique.length === 1)
    return `radial-gradient(60% 70% at 50% 60%, ${unique[0]}, transparent 75%)`;
  return unique
    .map((c, i) => {
      const [x, y] = GLOW_SPOTS[i % GLOW_SPOTS.length] ?? [50, 50];
      return `radial-gradient(45% 55% at ${x}% ${y}%, ${c}, transparent 72%)`;
    })
    .join(',');
}
