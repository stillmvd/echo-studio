import { rendererLoad } from '@/lib/ipc';
import { isWindowActive } from '@/lib/window-activity';
import { useUiStore } from '@/state/ui-store';

const CHECK_MS = 60_000;
export const HOT_LOAD = 30;
export const HOT_SAMPLES = 5;
export const STALE_MS = 24 * 3_600_000;
export const QUIET_HOT_MS = 2 * 60_000;
export const QUIET_STALE_MS = 10 * 60_000;
export const HOT_COOLDOWN_MS = 3_600_000;
export const LOG_KEY = 'echo:auto-refresh';
const LOG_SIZE = 20;

export type RefreshReason = 'hot' | 'stale';

export interface RefreshInput {
  hot: boolean;
  sinceHotReload: number;
  uptime: number;
  quietFor: number;
  active: boolean;
  busy: boolean;
}

export function isHot(loads: number[]): boolean {
  const tail = loads.slice(-HOT_SAMPLES);
  return tail.length === HOT_SAMPLES && tail.every((l) => l > HOT_LOAD);
}

export function refreshReason(o: RefreshInput): RefreshReason | null {
  if (o.busy) return null;
  const hot = o.hot && o.sinceHotReload >= HOT_COOLDOWN_MS;
  if (hot && (!o.active || o.quietFor >= QUIET_HOT_MS)) return 'hot';
  if (o.uptime >= STALE_MS && (!o.active || o.quietFor >= QUIET_STALE_MS)) return 'stale';
  return null;
}

function busy() {
  return (
    useUiStore.getState().memoryDirty || document.querySelector('[aria-modal="true"]') !== null
  );
}

interface LogEntry {
  at: string;
  reason: RefreshReason;
  loads: number[];
}

function readLog(): LogEntry[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
    return Array.isArray(list) ? (list as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function sinceHotReload(): number {
  const last = readLog()
    .filter((e) => e.reason === 'hot')
    .pop();
  const at = last ? Date.parse(last.at) : Number.NaN;
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : Date.now() - at;
}

function record(reason: RefreshReason, loads: number[]) {
  try {
    const list = readLog();
    const entry = { at: new Date().toISOString(), reason, loads: loads.map(Math.round) };
    localStorage.setItem(LOG_KEY, JSON.stringify([...list, entry].slice(-LOG_SIZE)));
  } catch {}
}

export function installAutoRefresh(): void {
  if (import.meta.env.DEV) return;
  let lastInput = performance.now();
  const touch = () => {
    lastInput = performance.now();
  };
  for (const type of ['pointerdown', 'keydown', 'wheel'] as const) {
    window.addEventListener(type, touch, { capture: true, passive: true });
  }
  const loads: number[] = [];
  let hot = false;
  setInterval(() => {
    void rendererLoad()
      .then((load) => {
        if (load === null) return;
        loads.push(load);
        if (loads.length > HOT_SAMPLES) loads.shift();
        hot ||= isHot(loads);
        const now = performance.now();
        const reason = refreshReason({
          hot,
          sinceHotReload: hot ? sinceHotReload() : 0,
          uptime: now,
          quietFor: now - lastInput,
          active: isWindowActive(),
          busy: busy(),
        });
        if (!reason) return;
        record(reason, loads);
        location.reload();
      })
      .catch(() => {});
  }, CHECK_MS);
}
