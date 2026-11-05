import { devTabKey } from '@/state/workbench-store';
import type { ClaudeSession, DevServer } from './types';
import { agentName, crashLabel, devHealth } from './workbench';

export const TOAST_GAP_MS = 10_000;
export const TOAST_TARGET_MS = 10 * 60_000;

export interface Toast {
  path: string;
  tab: string;
  title: string;
  body: string;
  at: number;
  window?: { pid: number; sessionId: string };
}

export type Marks = Map<string, string>;

export function marksOf(sessions: ClaudeSession[], devs: DevServer[]): Marks {
  const marks: Marks = new Map();
  for (const s of sessions) if (s.projectPath) marks.set(s.sessionId, s.status);
  for (const d of devs) marks.set(devTabKey(d.projectPath), devMark(d));
  return marks;
}

const devMark = (d: DevServer) => `${devHealth(d)}|${d.restarted ? d.startedAt : ''}`;

interface ToastInput {
  prev: Marks;
  sessions: ClaudeSession[];
  devs: DevServer[];
  name: (path: string) => string;
  unseen: (tab: string) => boolean;
  last: Map<string, number>;
  now: number;
}

export function pickToasts({ prev, sessions, devs, name, unseen, last, now }: ToastInput): Toast[] {
  const out: Toast[] = [];
  const add = (path: string, tab: string, body: string, window?: Toast['window']) => {
    if (!window && !unseen(tab)) return;
    if (now - (last.get(tab) ?? Number.NEGATIVE_INFINITY) < TOAST_GAP_MS) return;
    last.set(tab, now);
    out.push({ path, tab, title: name(path), body, at: now, ...(window ? { window } : {}) });
  };
  for (const s of sessions) {
    const was = prev.get(s.sessionId);
    if (!s.projectPath || was === undefined) continue;
    if (s.kind !== 'shell' && s.pid === null) continue;
    const window =
      s.kind === 'shell' || s.pid === null ? undefined : { pid: s.pid, sessionId: s.sessionId };
    const who = s.name?.trim() || agentName(s);
    if (s.status === 'waiting' && was !== 'waiting')
      add(s.projectPath, s.sessionId, `${who} — ждёт ответа`, window);
    if (s.status === 'done' && was === 'working')
      add(s.projectPath, s.sessionId, `${who} — закончил задачу`, window);
    if (s.status === 'error' && was !== 'error')
      add(s.projectPath, s.sessionId, `${who} — остановился с ошибкой`, window);
  }
  for (const d of devs) {
    const tab = devTabKey(d.projectPath);
    const was = prev.get(tab);
    if (was === undefined) continue;
    const [wasHealth, wasRestart] = was.split('|');
    const [health, restart] = devMark(d).split('|');
    if (health === 'crashed' && wasHealth !== 'crashed')
      add(d.projectPath, tab, `dev ${crashLabel(d)} — ${d.command}`);
    else if (restart && restart !== wasRestart)
      add(d.projectPath, tab, `dev упал, Echo запустил его снова — ${d.command}`);
  }
  return out;
}

let lastToast: Toast | null = null;

export function rememberToast(toast: Toast) {
  lastToast = toast;
}

export function takeActivation(now: number): Toast | null {
  const toast = lastToast;
  lastToast = null;
  return toast && now - toast.at <= TOAST_TARGET_MS ? toast : null;
}
