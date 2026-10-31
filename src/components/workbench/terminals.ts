import { Channel } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { type ILink, type ITerminalOptions, Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useSyncExternalStore } from 'react';
import {
  openTerminalPath,
  resolveTerminalPaths,
  tailDevLog,
  terminalAttach,
  terminalDetach,
  terminalDetachAll,
  terminalResize,
  terminalWrite,
  untailDevLog,
} from '@/lib/ipc';
import { onWindowActive } from '@/lib/window-activity';
import {
  caretStep,
  controlOnly,
  detectAgentView,
  echoedKeys,
  findLinks,
  IMAGE_PASTE,
  isImagePaste,
  isPathTitle,
  mouseReport,
  plainTitle,
  type TermLink,
  type TypedKey,
  terminalKey,
} from '@/lib/workbench';
import { toast } from '@/state/toast-store';

export type TermState = 'idle' | 'attaching' | 'live' | 'ended' | 'detached' | 'error';

interface Entry {
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  opened: boolean;
  cwd: string | null;
  terminalId: string | null;
  state: TermState;
  error: string | null;
  title: string | null;
  shortId: string | null;
  attachedAt: number;
  agentCheck: ReturnType<typeof setTimeout> | undefined;
  feed: Channel<ArrayBuffer | number[]> | null;
  early: string[];
  version: number;
  listeners: Set<() => void>;
  pasteImage: (() => void) | null;
  resetCaret: () => void;
  placeCaret: () => void;
  nudgeCaret: (data: string) => void;
  echoCaret: () => void;
  mouseCell: string | null;
}

const entries = new Map<string, Entry>();
const byTerminal = new Map<string, Entry>();
void terminalDetachAll().catch(() => {});
const shorts = new Map<string, { shortId: string; at: number }>();
const FRESH_MS = 20_000;

export function rememberShort(key: string, shortId: string, fresh = false) {
  shorts.set(key, { shortId, at: fresh ? Date.now() : (shorts.get(key)?.at ?? 0) });
}

export function shortOf(key: string): string | null {
  return shorts.get(key)?.shortId ?? null;
}

export const restarting = new Set<string>();

export function isFresh(key: string): boolean {
  if (restarting.has(key)) return true;
  const s = shorts.get(key);
  return !!s && Date.now() - s.at < FRESH_MS;
}

function notify(entry: Entry) {
  entry.version++;
  for (const l of entry.listeners) l();
}

function setTitle(entry: Entry, raw: string) {
  const title = plainTitle(raw);
  if (!title || isPathTitle(title) || title === entry.title) return;
  entry.title = title;
  notify(entry);
}

let refocus: Entry | null = null;
onWindowActive((active) => {
  if (!active) {
    refocus = [...entries.values()].find((e) => e.term.textarea === document.activeElement) ?? null;
    return;
  }
  const entry = refocus;
  refocus = null;
  if (!entry) return;
  requestAnimationFrame(() => {
    if (entry.host.isConnected && entry.host.offsetParent) entry.term.focus();
  });
});

const TWIN = 'Сессия уже открыта в другой вкладке';

function busy(state: TermState) {
  return state === 'attaching' || state === 'live';
}

function wakeTwins(shortId: string | null) {
  for (const e of entries.values()) {
    if (e.state === 'error' && e.error === TWIN && e.shortId === shortId) setState(e, 'idle');
  }
}

function setState(entry: Entry, state: TermState, error: string | null = null) {
  const was = entry.state;
  entry.state = state;
  entry.error = error;
  notify(entry);
  if (busy(was) && !busy(state)) wakeTwins(entry.shortId);
}

const earlyExits = new Set<string>();
const detached = new Set<string>();
const ID_MEMORY = 64;

function remember(set: Set<string>, id: string) {
  set.add(id);
  for (const old of set) {
    if (set.size <= ID_MEMORY) break;
    set.delete(old);
  }
}

function detach(terminalId: string) {
  byTerminal.delete(terminalId);
  remember(detached, terminalId);
  void terminalDetach(terminalId).catch(() => {});
}

void listen<{ terminalId: string; code: number }>('workbench://terminal-exit', (e) => {
  if (detached.delete(e.payload.terminalId)) return;
  const entry = byTerminal.get(e.payload.terminalId);
  if (!entry) {
    remember(earlyExits, e.payload.terminalId);
    return;
  }
  byTerminal.delete(e.payload.terminalId);
  entry.terminalId = null;
  setState(entry, 'detached');
}).catch(() => {});

const AGENT_VIEW_DEBOUNCE_MS = 200;
function screenLines(term: Terminal): string[] {
  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let i = Math.max(0, buf.length - term.rows); i < buf.length; i++) {
    lines.push(buf.getLine(i)?.translateToString(true) ?? '');
  }
  return lines;
}

function watchAgentView(entry: Entry) {
  clearTimeout(entry.agentCheck);
  entry.agentCheck = setTimeout(() => {
    const id = entry.terminalId;
    if (!id || entry.state !== 'live' || !detectAgentView(screenLines(entry.term))) return;
    detach(id);
    entry.terminalId = null;
    entry.term.reset();
    entry.resetCaret();
    setState(entry, 'detached');
  }, AGENT_VIEW_DEBOUNCE_MS);
}

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
    cwd: null,
    terminalId: null,
    state: 'idle',
    error: null,
    title: null,
    shortId: null,
    attachedAt: 0,
    agentCheck: undefined,
    feed: null,
    early: [],
    version: 0,
    listeners: new Set(),
    pasteImage: null,
    resetCaret: () => {},
    placeCaret: () => {},
    nudgeCaret: () => {},
    echoCaret: () => {},
    mouseCell: null,
  };
  term.onTitleChange((t) => setTitle(entry, t));
  term.options.linkHandler = {
    hover: () => {
      oscHovered = true;
    },
    leave: () => {
      oscHovered = false;
    },
    activate: (e, uri) => {
      if (!e.ctrlKey) return;
      if (/^https?:\/\//i.test(uri)) openLink({ kind: 'url', target: uri });
      else if (/^file:\/\//i.test(uri)) {
        const path = decodeURIComponent(new URL(uri).pathname).replace(/^\/([A-Za-z]:)/, '$1');
        openLink({ kind: 'path', target: path });
      }
    },
  };
  term.registerLinkProvider({
    provideLinks: (row, done) => {
      linksAt(entry, row).then(done, () => done(undefined));
    },
  });
  return entry;
}

function openLink(
  link: Pick<TermLink, 'kind' | 'target'> & Partial<Pick<TermLink, 'line' | 'column'>>,
) {
  const failed = (e: unknown) => toast(`Не открылось: ${String(e)}`, 'fail');
  if (link.kind === 'url') open(link.target).catch(failed);
  else openTerminalPath(link.target, link.line ?? null, link.column ?? null).catch(failed);
}

let hovered: ILink | null = null;
let oscHovered = false;
function markLink(on: boolean) {
  const decorations = hovered?.decorations;
  if (!decorations) return;
  decorations.underline = on;
  decorations.pointerCursor = on;
}
for (const type of ['keydown', 'keyup'] as const) {
  window.addEventListener(
    type,
    (e) => {
      if (e.key === 'Control') markLink(type === 'keydown');
    },
    true,
  );
}

function logicalRow(term: Terminal, y: number) {
  const buf = term.buffer.active;
  let top = y;
  while (top > 0 && buf.getLine(top)?.isWrapped) top--;
  let bottom = y;
  while (buf.getLine(bottom + 1)?.isWrapped) bottom++;
  let text = '';
  const cells: { from: number; to: number; y: number }[] = [];
  for (let row = top; row <= bottom; row++) {
    const line = buf.getLine(row);
    if (!line) break;
    for (let x = 0; x < line.length; x++) {
      const cell = line.getCell(x);
      if (!cell || cell.getWidth() === 0) continue;
      const chars = cell.getChars() || ' ';
      for (let i = 0; i < chars.length; i++) {
        cells.push({ from: x + 1, to: x + cell.getWidth(), y: row + 1 });
      }
      text += chars;
    }
  }
  return { text, cells };
}

async function linksAt(entry: Entry, row: number): Promise<ILink[] | undefined> {
  const { text, cells } = logicalRow(entry.term, row - 1);
  const found = findLinks(text).filter((link) => {
    const first = cells[link.start];
    const last = cells[link.end - 1];
    return !!first && !!last && first.y <= row && last.y >= row;
  });
  const paths = found.filter((link) => link.kind === 'path');
  const resolved = paths.length
    ? await resolveTerminalPaths(
        entry.cwd,
        paths.map((link) => link.target),
      )
    : [];
  const real = new Map(paths.map((link, i) => [link, resolved[i] ?? null]));
  const links = found.flatMap((link): ILink[] => {
    const first = cells[link.start];
    const last = cells[link.end - 1];
    const target = link.kind === 'url' ? link.target : real.get(link);
    if (!first || !last || !target) return [];
    const shown: ILink = {
      range: { start: { x: first.from, y: first.y }, end: { x: last.to, y: last.y } },
      text: text.slice(link.start, link.end),
      decorations: { underline: false, pointerCursor: false },
      activate: (e) => {
        if (e.ctrlKey) openLink({ ...link, target });
      },
      hover: (e) => {
        hovered = shown;
        queueMicrotask(() => {
          if (hovered === shown) markLink(e.ctrlKey);
        });
      },
      leave: () => {
        if (hovered !== shown) return;
        markLink(false);
        hovered = null;
      },
    };
    return [shown];
  });
  return links.length ? links : undefined;
}

const CARET_HIDE_MS = 600;
const CARET_STALE_MS = 300;
const INPUT_START = 2;

function attachCaret(entry: Entry) {
  const { term } = entry;
  const el = document.createElement('div');
  el.className = 'wb-caret';
  el.hidden = true;
  let at: { x: number; y: number } | null = null;
  let typed: (TypedKey & { t: number })[] = [];
  let base = '';
  let hiding: ReturnType<typeof setTimeout> | undefined;
  const fresh = () => {
    const now = performance.now();
    typed = typed.filter((k) => now - k.t < CARET_STALE_MS);
  };
  const clampX = (x: number) => Math.max(0, Math.min(term.cols - 1, x));
  const place = () => {
    const screen = term.element?.querySelector<HTMLElement>('.xterm-screen');
    if (!screen || !at || term.cols === 0 || term.rows === 0) return;
    if (el.parentElement !== screen) screen.appendChild(el);
    const w = screen.clientWidth / term.cols;
    const h = screen.clientHeight / term.rows;
    el.style.transform = `translate(${clampX(at.x) * w}px, ${at.y * h}px)`;
    el.style.height = `${h}px`;
  };
  const hideLater = () => {
    clearTimeout(hiding);
    hiding = setTimeout(() => {
      el.hidden = true;
    }, CARET_HIDE_MS);
  };
  const rowText = (y: number) => {
    const buf = term.buffer.active;
    const line = buf.getLine(buf.baseY + y);
    let text = '';
    for (let x = 0; x < term.cols; x++) {
      const cell = line?.getCell(x);
      if (cell && !cell.isDim()) text += cell.getChars() || ' ';
    }
    return text.replaceAll(' ', ' ').trimEnd();
  };
  entry.echoCaret = () => {
    if (!at || typed.length === 0) return;
    fresh();
    const actual = rowText(at.y);
    const hit = echoedKeys(base, at.x, typed, actual, INPUT_START);
    if (!hit) return;
    typed.splice(0, hit.count);
    base = actual;
    at = { x: clampX(hit.x), y: at.y };
    if (!el.hidden) place();
    if (hiding !== undefined) hideLater();
  };
  term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
    if (!params.includes(25)) return false;
    clearTimeout(hiding);
    hiding = undefined;
    fresh();
    at = { x: term.buffer.active.cursorX, y: term.buffer.active.cursorY };
    base = rowText(at.y);
    for (const k of typed) k.shown = true;
    el.hidden = false;
    place();
    return false;
  });
  term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
    if (!params.includes(25)) return false;
    hideLater();
    return false;
  });
  term.onResize(place);
  entry.placeCaret = place;
  entry.nudgeCaret = (data) => {
    const dx = caretStep(data);
    if (dx === 0) return;
    fresh();
    const t = performance.now();
    const del = data === '\x7f' || data === '\b';
    if (!del && !data.startsWith('\x1b'))
      for (const ch of data) typed.push({ t, ch, dx: 1, del, shown: false });
    else typed.push({ t, ch: null, dx, del, shown: false });
  };
  entry.resetCaret = () => {
    clearTimeout(hiding);
    hiding = undefined;
    at = null;
    typed = [];
    el.hidden = true;
  };
}

function send(entry: Entry, data: string) {
  const mouse = mouseReport(data);
  if (mouse) {
    if (mouse.ctrl && !mouse.motion && (hovered || oscHovered)) return;
    if (mouse.motion && mouse.cell === entry.mouseCell) return;
    entry.mouseCell = mouse.cell;
  }
  if (entry.terminalId) {
    terminalWrite(entry.terminalId, data).catch(() => {});
    entry.nudgeCaret(data);
  } else if (entry.state === 'attaching') entry.early.push(data);
}

function claudeEntry(key: string): Entry {
  const existing = entries.get(key);
  if (existing) return existing;
  const entry = create({
    cursorBlink: false,
    cursorStyle: 'bar',
    cursorWidth: 1,
    cursorInactiveStyle: 'none',
    theme: { ...theme(), cursor: 'transparent' },
  });
  attachCaret(entry);
  const { term } = entry;
  term.attachCustomKeyEventHandler((ev) => {
    const action = terminalKey(ev, term.hasSelection());
    if (!action) return true;
    if ('send' in action) {
      ev.preventDefault();
      send(entry, action.send);
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
  term.onData((data) => send(entry, data));
  entry.pasteImage = () => send(entry, IMAGE_PASTE);
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
  entry.cwd = projectPath;
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

async function clickPaste(entry: Entry) {
  const { term } = entry;
  if (term.hasSelection()) {
    await navigator.clipboard.writeText(term.getSelection());
    term.clearSelection();
    return;
  }
  if (!entry.pasteImage) return;
  term.focus();
  const items = await navigator.clipboard.read();
  const text = items.find((i) => i.types.includes('text/plain'));
  if (text) term.paste(await (await text.getType('text/plain')).text());
  else if (items.some((i) => i.types.some((t) => t.startsWith('image/')))) entry.pasteImage();
}

export function mount(entry: Entry, container: HTMLElement) {
  container.appendChild(entry.host);
  if (entry.opened) return;
  entry.term.open(entry.host);
  entry.term.textarea?.setAttribute('aria-label', 'Ввод в терминал');
  entry.term.element?.addEventListener(
    'paste',
    (e) => {
      if (!entry.pasteImage || !isImagePaste(e.clipboardData)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      entry.pasteImage();
    },
    true,
  );
  entry.host.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clickPaste(entry).catch(() => {});
  });
  try {
    const gl = new WebglAddon();
    gl.onContextLoss(() => gl.dispose());
    entry.term.loadAddon(gl);
  } catch {}
  entry.opened = true;
}

export function unmount(entry: Entry, container: HTMLElement) {
  if (entry.host.parentElement === container) entry.host.remove();
}

export function fitTerm(entry: Entry) {
  if (!entry.opened || entry.host.clientWidth === 0 || entry.host.clientHeight === 0) return;
  entry.fit.fit();
  entry.placeCaret();
  if (entry.terminalId) {
    void terminalResize(entry.terminalId, entry.term.cols, entry.term.rows).catch(() => {});
  }
}

const utf8 = new TextDecoder();
const inflight = new Map<string, Promise<unknown>>();
const ATTACH_WAIT_MS = 15_000;

export function connect(key: string, shortId: string) {
  const entry = claudeEntry(key);
  if (busy(entry.state)) return;
  entry.shortId = shortId;
  const twin = [...entries.entries()].some(
    ([k, e]) => k !== key && e.shortId === shortId && busy(e.state),
  );
  if (twin) {
    setState(entry, 'error', TWIN);
    return;
  }
  entry.attachedAt = Date.now();
  entry.early = [];
  setState(entry, 'attaching');
  entry.term.reset();
  entry.resetCaret();
  fitTerm(entry);
  const channel = new Channel<ArrayBuffer | number[]>();
  entry.feed = channel;
  channel.onmessage = (chunk) => {
    if (entry.feed !== channel || entry.state === 'detached') return;
    const bytes = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : new Uint8Array(chunk);
    const control =
      bytes[0] === 0x1b && bytes.length < 512 ? controlOnly(utf8.decode(bytes)) : null;
    if (control) {
      if (control.title !== null) setTitle(entry, control.title);
      return;
    }
    entry.term.write(bytes, () => {
      entry.echoCaret();
      watchAgentView(entry);
    });
  };
  const previous = inflight.get(shortId);
  const waited = previous
    ? Promise.race([
        previous.catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, ATTACH_WAIT_MS)),
      ])
    : Promise.resolve();
  const call = waited.then(() =>
    entries.get(key) === entry
      ? terminalAttach(shortId, entry.term.cols, entry.term.rows, channel as Channel<ArrayBuffer>)
      : null,
  );
  inflight.set(shortId, call);
  void call
    .finally(() => {
      if (inflight.get(shortId) === call) inflight.delete(shortId);
    })
    .catch(() => {});
  call
    .then((id) => {
      if (id === null) return;
      const exited = earlyExits.delete(id);
      if (entries.get(key) !== entry) {
        if (!exited) detach(id);
        return;
      }
      if (exited) {
        setState(entry, 'ended');
        return;
      }
      entry.terminalId = id;
      byTerminal.set(id, entry);
      for (const data of entry.early.splice(0)) terminalWrite(id, data).catch(() => {});
      setState(entry, 'live');
      fitTerm(entry);
    })
    .catch((e) => setState(entry, 'error', String(e)));
}

export function reattach(key: string, shortId: string) {
  const entry = entries.get(key);
  if (entry?.terminalId) {
    detach(entry.terminalId);
    entry.terminalId = null;
    entry.state = 'ended';
  }
  connect(key, shortId);
}

export function rekey(from: string, to: string): boolean {
  const entry = entries.get(from);
  if (!entry || entries.has(to) || entry.state === 'attaching') return false;
  entries.delete(from);
  entries.set(to, entry);
  const short = shorts.get(from);
  shorts.delete(from);
  if (short && !shorts.has(to)) shorts.set(to, short);
  return true;
}

export function dispose(key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  clearTimeout(entry.agentCheck);
  stopTail(key);
  if (entry.terminalId) detach(entry.terminalId);
  if (busy(entry.state)) wakeTwins(entry.shortId);
  entry.term.dispose();
  entry.host.remove();
}

const misses = new Map<string, number>();
let lastScan = 0;

export function pruneMissing(
  scanAt: number,
  tabs: Record<string, string[]>,
  exists: (path: string) => boolean,
) {
  const fresh = scanAt !== lastScan;
  lastScan = scanAt;
  for (const [path, keys] of Object.entries(tabs)) {
    if (exists(path)) {
      misses.delete(path);
      continue;
    }
    const n = (misses.get(path) ?? 0) + (fresh ? 1 : 0);
    misses.set(path, n);
    if (n >= 2) for (const key of keys) dispose(key);
  }
}

const shown = new Map<string, number>();

export function useShown(key: string, visible: boolean) {
  useEffect(() => {
    if (!visible) return;
    shown.set(key, (shown.get(key) ?? 0) + 1);
    return () => {
      const n = (shown.get(key) ?? 1) - 1;
      if (n > 0) shown.set(key, n);
      else shown.delete(key);
    };
  }, [key, visible]);
}

export function isShown(key: string): boolean {
  return shown.has(key);
}

export function revealText(key: string, needle: string): boolean {
  const term = entries.get(key)?.term;
  if (!term) return false;
  const buf = term.buffer.active;
  const rows: { start: number; text: string }[] = [];
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    const text = (line?.translateToString(true) ?? '').replaceAll('\\', '/');
    const last = rows[rows.length - 1];
    if (line?.isWrapped && last) last.text += text;
    else rows.push({ start: i, text });
  }
  const last = (part: string) => [...rows].reverse().find((r) => r.text.includes(part));
  const hit = last(needle) ?? last(needle.replace(/:\d+$/, ''));
  if (!hit) return false;
  term.scrollToLine(Math.max(0, hit.start - 3));
  term.selectLines(hit.start, hit.start);
  return true;
}

export function focus(key: string) {
  entries.get(key)?.term.focus();
}

export function focusSoon(key: string) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const entry = entries.get(key);
      if (entry?.host.isConnected && entry.host.offsetParent) entry.term.focus();
    }),
  );
}

export function useClaudeTerm(key: string, cwd?: string) {
  const entry = claudeEntry(key);
  if (cwd) entry.cwd = cwd;
  useSyncExternalStore(
    (cb) => {
      entry.listeners.add(cb);
      return () => entry.listeners.delete(cb);
    },
    () => entry.version,
  );
  return entry;
}
