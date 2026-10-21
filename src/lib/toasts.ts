import { devTabKey } from '@/state/workbench-store';
import type { ClaudeSession, DevServer } from './types';
import { crashLabel, devHealth } from './workbench';

export const TOAST_GAP_MS = 10_000;
export const TOAST_TARGET_MS = 10 * 60_000;

export interface Toast {
  path: string;
  tab: string;
  title: string;
  body: string;
  at: number;
}

export type Marks = Map<string, string>;

export function marksOf(sessions: ClaudeSession[], devs: DevServer[]): Marks {
  const marks: Marks = new Map();
  for (const s of sessions)
    if (s.kind === 'shell' && s.projectPath) marks.set(s.sessionId, s.status);
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
  const add = (path: string, tab: string, body: string) => {
    if (!unseen(tab) || now - (last.get(tab) ?? Number.NEGATIVE_INFINITY) < TOAST_GAP_MS) return;
    last.set(tab, now);
    out.push({ path, tab, title: name(path), body, at: now });
  };
  for (const s of sessions) {
    const was = prev.get(s.sessionId);
    if (s.kind !== 'shell' || !s.projectPath || was === undefined) continue;
    const who = s.name?.trim() || 'Claude';
    if (s.status === 'waiting' && was !== 'waiting')
      add(s.projectPath, s.sessionId, `${who} — ждёт ответа`);
    if (s.status === 'done' && was === 'working')
      add(s.projectPath, s.sessionId, `${who} — закончил задачу`);
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
