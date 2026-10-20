import { Channel } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { type ITerminalOptions, Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useSyncExternalStore } from 'react';
import {
  tailDevLog,
  terminalAttach,
  terminalDetach,
  terminalDetachAll,
  terminalResize,
  terminalWrite,
  untailDevLog,
} from '@/lib/ipc';
import { terminalKey } from '@/lib/workbench';

export type TermState = 'idle' | 'attaching' | 'live' | 'ended' | 'error';

interface Entry {
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  opened: boolean;
  terminalId: string | null;
  state: TermState;
  error: string | null;
  title: string | null;
  attachedAt: number;
  version: number;
  listeners: Set<() => void>;
}

const entries = new Map<string, Entry>();
const byTerminal = new Map<string, Entry>();
void terminalDetachAll().catch(() => {});
const shorts = new Map<string, { shortId: string; at: number }>();
const FRESH_MS = 20_000;

export function rememberShort(key: string, shortId: string, fresh = false) {
  shorts.set(key, { shortId, at: fresh ? Date.now() : 0 });
}

export function shortOf(key: string): string | null {
  return shorts.get(key)?.shortId ?? null;
}

export function isFresh(key: string): boolean {
  const s = shorts.get(key);
  return !!s && Date.now() - s.at < FRESH_MS;
}

function notify(entry: Entry) {
  entry.version++;
  for (const l of entry.listeners) l();
}

function setState(entry: Entry, state: TermState, error: string | null = null) {
  entry.state = state;
  entry.error = error;
  notify(entry);
}

const earlyExits = new Set<string>();

void listen<{ terminalId: string; code: number }>('workbench://terminal-exit', (e) => {
  const entry = byTerminal.get(e.payload.terminalId);
  if (!entry) {
    if (earlyExits.size > 64) earlyExits.clear();
    earlyExits.add(e.payload.terminalId);
    return;
  }
  byTerminal.delete(e.payload.terminalId);
  entry.terminalId = null;
  setState(entry, 'ended');
}).catch(() => {});

function theme(): ITerminalOptions['theme'] {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: v('--color-bg-primary'),
    foreground: v('--color-text-primary'),
    cursor: v('--color-text-primary'),
    cursorAccent: v('--color-bg-primary'),
    selectionBackground: v('--color-glow-strong'),
  };
}

function create(options: Partial<ITerminalOptions>): Entry {
  const term = new Terminal({
    fontFamily: "'Cascadia Mono', 'Geist Mono', Consolas, monospace",
    fontSize: 13,
    lineHeight: 1.15,
    cursorBlink: true,
    scrollback: 0,
    theme: theme(),
    ...options,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const host = document.createElement('div');
  host.style.height = '100%';
  const entry: Entry = {
    term,
    fit,
    host,
    opened: false,
    terminalId: null,
    state: 'idle',
    error: null,
    title: null,
    attachedAt: 0,
    version: 0,
    listeners: new Set(),
  };
  term.onTitleChange((t) => {
    entry.title = t;
    notify(entry);
  });
  return entry;
}

function claudeEntry(key: string): Entry {
  const existing = entries.get(key);
  if (existing) return existing;
  const entry = create({});
  const { term } = entry;
  term.attachCustomKeyEventHandler((ev) => {
    const action = terminalKey(ev, term.hasSelection());
    if (!action) return true;
    if ('send' in action) {
      ev.preventDefault();
      if (entry.terminalId) void terminalWrite(entry.terminalId, action.send);
      return false;
    }
    if ('copy' in action) {
      ev.preventDefault();
      void navigator.clipboard.writeText(term.getSelection());
      term.clearSelection();
      return false;
    }
    return false;
  });
  term.onData((data) => {
    if (entry.terminalId) void terminalWrite(entry.terminalId, data);
  });
  entries.set(key, entry);
  return entry;
}

export function logEntry(key: string): Entry {
  const existing = entries.get(key);
  if (existing) return existing;
  const entry = create({
    disableStdin: true,
    scrollback: 5000,
    cursorBlink: false,
    cursorStyle: 'underline',
    convertEol: true,
  });
  entries.set(key, entry);
  return entry;
}

const tails = new Map<string, { token: number; id: number | null }>();
let tailSeq = 0;

export function startTail(key: string, projectPath: string, fresh = false) {
  const entry = logEntry(key);
  if (fresh) {
    stopTail(key);
    entry.term.reset();
  }
  if (tails.has(key)) return;
  const tail = { token: ++tailSeq, id: null as number | null };
  tails.set(key, tail);
  const channel = new Channel<number[]>();
  channel.onmessage = (chunk) => {
    if (chunk.length && tails.get(key) === tail) entry.term.write(new Uint8Array(chunk));
  };
  tailDevLog(projectPath, channel)
    .then((r) => {
      if (tails.get(key) === tail) tail.id = r.subscriptionId;
      else void untailDevLog(r.subscriptionId).catch(() => {});
    })
    .catch(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
}

export function stopTail(key: string) {
  const tail = tails.get(key);
  tails.delete(key);
  if (tail?.id != null) void untailDevLog(tail.id).catch(() => {});
}

export function mount(entry: Entry, container: HTMLElement) {
  container.appendChild(entry.host);
  if (entry.opened) return;
  entry.term.open(entry.host);
  try {
    const gl = new WebglAddon();
    gl.onContextLoss(() => gl.dispose());
    entry.term.loadAddon(gl);
  } catch {}
  entry.opened = true;
}

export function unmount(entry: Entry) {
  entry.host.remove();
}

export function fitTerm(entry: Entry) {
  if (!entry.opened || entry.host.clientWidth === 0 || entry.host.clientHeight === 0) return;
  entry.fit.fit();
  if (entry.terminalId) {
    void terminalResize(entry.terminalId, entry.term.cols, entry.term.rows).catch(() => {});
  }
}

export function connect(key: string, shortId: string) {
  const entry = claudeEntry(key);
  if (entry.state === 'attaching' || entry.state === 'live') return;
  entry.attachedAt = Date.now();
  setState(entry, 'attaching');
  entry.term.reset();
  fitTerm(entry);
  const channel = new Channel<ArrayBuffer | number[]>();
  channel.onmessage = (chunk) => {
    entry.term.write(chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : new Uint8Array(chunk));
  };
  terminalAttach(shortId, entry.term.cols, entry.term.rows, channel as Channel<ArrayBuffer>)
    .then((id) => {
      const exited = earlyExits.delete(id);
      if (entries.get(key) !== entry) {
        if (!exited) void terminalDetach(id).catch(() => {});
        return;
      }
      if (exited) {
        setState(entry, 'ended');
        return;
      }
      entry.terminalId = id;
      byTerminal.set(id, entry);
      setState(entry, 'live');
      fitTerm(entry);
    })
    .catch((e) => setState(entry, 'error', String(e)));
}

export function reattach(key: string, shortId: string) {
  const entry = entries.get(key);
  if (entry?.terminalId) {
    byTerminal.delete(entry.terminalId);
    void terminalDetach(entry.terminalId).catch(() => {});
    entry.terminalId = null;
    entry.state = 'ended';
  }
  connect(key, shortId);
}

export function dispose(key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  stopTail(key);
  if (entry.terminalId) {
    byTerminal.delete(entry.terminalId);
    void terminalDetach(entry.terminalId).catch(() => {});
  }
  entry.term.dispose();
  entry.host.remove();
}

export function focus(key: string) {
  entries.get(key)?.term.focus();
}

export function useClaudeTerm(key: string) {
  const entry = claudeEntry(key);
  useSyncExternalStore(
    (cb) => {
      entry.listeners.add(cb);
      return () => entry.listeners.delete(cb);
    },
    () => entry.version,
  );
  return entry;
}
