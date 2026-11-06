import { CELL_COUNT, insertTab, isLayout, type WallLayout } from './workbench';

export interface Pane {
  tabs: string[];
  active?: string;
}

export interface ProjectGrid {
  layout: WallLayout;
  panes: Pane[];
  focus: number;
}

export type Edge = 'left' | 'right' | 'top' | 'bottom';

export function emptyGrid(): ProjectGrid {
  return { layout: '1x1', panes: [{ tabs: [] }], focus: 0 };
}

export function gridTabs(g: ProjectGrid): string[] {
  return g.panes.flatMap((p) => p.tabs);
}

export function paneOf(g: ProjectGrid, key: string): number {
  return g.panes.findIndex((p) => p.tabs.includes(key));
}

export function focusedKey(g: ProjectGrid): string | undefined {
  return g.panes[g.focus]?.active;
}

function clampFocus(g: ProjectGrid, focus: number): number {
  return Math.min(Math.max(focus, 0), g.panes.length - 1);
}

function without(p: Pane, key: string): Pane {
  if (!p.tabs.includes(key)) return p;
  const tabs = p.tabs.filter((k) => k !== key);
  return { tabs, active: p.active === key ? tabs[tabs.length - 1] : p.active };
}

function withPane(g: ProjectGrid, i: number, pane: Pane): Pane[] {
  return g.panes.map((p, j) => (j === i ? pane : p));
}

export function openInGrid(g: ProjectGrid, key: string): ProjectGrid {
  const at = paneOf(g, key);
  if (at >= 0) {
    const pane = g.panes[at] as Pane;
    return { ...g, focus: at, panes: withPane(g, at, { ...pane, active: key }) };
  }
  const focus = clampFocus(g, g.focus);
  const pane = g.panes[focus] ?? { tabs: [] };
  return { ...g, focus, panes: withPane(g, focus, { tabs: [...pane.tabs, key], active: key }) };
}

export function adoptInGrid(g: ProjectGrid, key: string): ProjectGrid {
  if (paneOf(g, key) >= 0) return g;
  const focus = clampFocus(g, g.focus);
  const pane = g.panes[focus] ?? { tabs: [] };
  return {
    ...g,
    focus,
    panes: withPane(g, focus, { tabs: [...pane.tabs, key], active: pane.active ?? key }),
  };
}

export function closeInGrid(g: ProjectGrid, key: string): ProjectGrid {
  if (paneOf(g, key) < 0) return g;
  return { ...g, panes: g.panes.map((p) => without(p, key)) };
}

export function renameInGrid(g: ProjectGrid, from: string, to: string): ProjectGrid {
  const swap = (k: string) => (k === from ? to : k);
  return {
    ...g,
    panes: g.panes.map((p) => ({
      tabs: p.tabs.map(swap),
      active: p.active === undefined ? undefined : swap(p.active),
    })),
  };
}

export function activateInGrid(g: ProjectGrid, pane: number, key: string): ProjectGrid {
  const p = g.panes[pane];
  if (!p?.tabs.includes(key)) return g;
  if (p.active === key && g.focus === pane) return g;
  return { ...g, focus: pane, panes: withPane(g, pane, { ...p, active: key }) };
}

export function moveInGrid(g: ProjectGrid, key: string, to: number, index?: number): ProjectGrid {
  const from = paneOf(g, key);
  const target = g.panes[to];
  if (from < 0 || !target) return g;
  if (from === to) {
    if (index === undefined) return activateInGrid(g, to, key);
    return {
      ...g,
      focus: to,
      panes: withPane(g, to, { tabs: insertTab(target.tabs, key, index), active: key }),
    };
  }
  const panes = g.panes.map((p) => without(p, key));
  const dest = panes[to] as Pane;
  const at = index ?? dest.tabs.length;
  panes[to] = { tabs: [...dest.tabs.slice(0, at), key, ...dest.tabs.slice(at)], active: key };
  return { ...g, focus: to, panes };
}

export function splitEdges(layout: WallLayout): Edge[] {
  if (layout === '1x1') return ['left', 'right'];
  if (layout === '2x1') return ['top', 'bottom'];
  return [];
}

export function splitGrid(
  g: ProjectGrid,
  key: string,
  target: number,
  edge: Edge,
): ProjectGrid | null {
  const from = paneOf(g, key);
  const host = g.panes[target];
  if (from < 0 || !host || !splitEdges(g.layout).includes(edge)) return null;
  if (from === target && host.tabs.length < 2) return null;
  const rest = g.panes.map((p) => without(p, key));
  const fresh: Pane = { tabs: [key], active: key };
  if (g.layout === '1x1') {
    const old = rest[0] as Pane;
    return edge === 'right'
      ? { layout: '2x1', panes: [old, fresh], focus: 1 }
      : { layout: '2x1', panes: [fresh, old], focus: 0 };
  }
  const col = target % 2;
  const panes: Pane[] = [rest[0] as Pane, rest[1] as Pane, { tabs: [] }, { tabs: [] }];
  if (edge === 'bottom') {
    panes[2 + col] = fresh;
    return { layout: '2x2', panes, focus: 2 + col };
  }
  panes[2 + col] = panes[col] as Pane;
  panes[col] = fresh;
  return { layout: '2x2', panes, focus: col };
}

export function resizeGrid(g: ProjectGrid, layout: WallLayout): ProjectGrid {
  const n = CELL_COUNT[layout];
  if (n === g.panes.length) return g.layout === layout ? g : { ...g, layout };
  if (n > g.panes.length) {
    const panes = [...g.panes];
    while (panes.length < n) panes.push({ tabs: [] });
    return { layout, panes, focus: g.focus };
  }
  const panes: Pane[] = g.panes.slice(0, n).map((p) => ({ ...p, tabs: [...p.tabs] }));
  for (const [i, p] of g.panes.entries()) {
    if (i < n) continue;
    const into = panes[i % n] as Pane;
    into.tabs.push(...p.tabs);
    into.active = into.active ?? p.active;
  }
  return { layout, panes, focus: g.focus % n };
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function normalizeGrid(raw: unknown): ProjectGrid | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as { layout?: unknown; panes?: unknown; focus?: unknown };
  const layout = isLayout(src.layout) ? src.layout : '1x1';
  const list = Array.isArray(src.panes) ? src.panes : [];
  const used = new Set<string>();
  const panes: Pane[] = Array.from({ length: CELL_COUNT[layout] }, (_, i) => {
    const p = (list[i] ?? {}) as { tabs?: unknown; active?: unknown };
    const tabs = strings(p.tabs).filter((k) => !used.has(k) && !!used.add(k));
    const active =
      typeof p.active === 'string' && tabs.includes(p.active) ? p.active : tabs[tabs.length - 1];
    return active ? { tabs, active } : { tabs };
  });
  const focus = typeof src.focus === 'number' && Number.isInteger(src.focus) ? src.focus : 0;
  return { layout, panes, focus: Math.min(Math.max(focus, 0), panes.length - 1) };
}

export function gridFromTabs(tabs: string[], actives: string[] = []): ProjectGrid {
  const split = [...new Set(actives.filter((k) => tabs.includes(k)))];
  if (split.length < 2) {
    const active = split[0] ?? tabs[tabs.length - 1];
    return { layout: '1x1', panes: [active ? { tabs, active } : { tabs }], focus: 0 };
  }
  const layout: WallLayout = split.length > 2 ? '2x2' : '2x1';
  const placed = split.slice(0, CELL_COUNT[layout]);
  const panes: Pane[] = Array.from({ length: CELL_COUNT[layout] }, (_, i) => {
    const key = placed[i];
    return key ? { tabs: [key], active: key } : { tabs: [] };
  });
  const first = panes[0] as Pane;
  first.tabs.push(...tabs.filter((k) => !placed.includes(k)));
  return { layout, panes, focus: 0 };
}
