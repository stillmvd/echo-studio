import { type DragEvent, useEffect, useState } from 'react';
import type { Edge } from '@/lib/project-grid';
import { TAB_DRAG_TYPE } from '@/lib/workbench';

const TYPE = TAB_DRAG_TYPE;

export interface DraggedTab {
  path: string;
  key: string;
  cell: string;
}

let dragging: DraggedTab | null = null;

export function tabDragProps(tab: DraggedTab | null) {
  if (!tab) return {};
  return {
    draggable: true,
    'data-tab': tab.key,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.setData(TYPE, JSON.stringify(tab));
      e.dataTransfer.effectAllowed = 'move';
      dragging = tab;
    },
    onDragEnd: () => {
      dragging = null;
    },
  };
}

function read(e: DragEvent<HTMLElement>): DraggedTab | null {
  try {
    const t = JSON.parse(e.dataTransfer.getData(TYPE)) as Partial<DraggedTab>;
    if (typeof t.path === 'string' && typeof t.key === 'string' && typeof t.cell === 'string') {
      return { path: t.path, key: t.key, cell: t.cell };
    }
  } catch {}
  return dragging;
}

function indexAt(zone: HTMLElement, x: number, y: number): number | null {
  const strip = zone.querySelector('.wb-tabs');
  if (!strip) return null;
  const r = strip.getBoundingClientRect();
  if (y < r.top || y > r.bottom) return null;
  return [...strip.querySelectorAll<HTMLElement>('[data-tab]')].filter((el) => {
    const b = el.getBoundingClientRect();
    return b.left + b.width / 2 < x;
  }).length;
}

const EDGE_BAND = 0.3;

function edgeAt(zone: HTMLElement, x: number, y: number, edges: Edge[]): Edge | null {
  const r = zone.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const fx = (x - r.left) / r.width;
  const fy = (y - r.top) / r.height;
  const near: [Edge, number][] = [
    ['left', fx],
    ['right', 1 - fx],
    ['top', fy],
    ['bottom', 1 - fy],
  ];
  const hit = near
    .filter(([edge, d]) => edges.includes(edge) && d < EDGE_BAND)
    .sort((a, b) => a[1] - b[1])[0];
  return hit ? hit[0] : null;
}

interface PaneDropOptions {
  path: string;
  cell: string;
  keys: string[];
  edges: Edge[];
  onDrop: (tab: DraggedTab, index: number | undefined, edge: Edge | null) => void;
}

interface PaneHover {
  insert: number | null;
  edge: Edge | null;
  center: boolean;
}

const NO_HOVER: PaneHover = { insert: null, edge: null, center: false };

export function usePaneDrop({ path, cell, keys, edges, onDrop }: PaneDropOptions) {
  const [hover, setHover] = useState<PaneHover>(NO_HOVER);
  const active = hover !== NO_HOVER;
  useEffect(() => {
    if (!active) return;
    const off = () => setHover(NO_HOVER);
    window.addEventListener('dragend', off);
    return () => window.removeEventListener('dragend', off);
  }, [active]);
  const resolve = (tab: DraggedTab, zone: HTMLElement, x: number, y: number): PaneHover => {
    const self = tab.cell === cell;
    const index = indexAt(zone, x, y);
    if (index !== null) {
      const at = keys.indexOf(tab.key);
      const still = self && at >= 0 && (index === at || index === at + 1);
      return { insert: still ? null : index, edge: null, center: false };
    }
    const allowed = self && keys.length < 2 ? [] : edges;
    const edge = edgeAt(zone, x, y, allowed);
    if (edge) return { insert: null, edge, center: false };
    return self ? NO_HOVER : { insert: null, edge: null, center: true };
  };
  return {
    hover,
    props: {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(TYPE) || !dragging || dragging.path !== path) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const next = resolve(dragging, e.currentTarget, e.clientX, e.clientY);
        setHover((h) =>
          h.insert === next.insert && h.edge === next.edge && h.center === next.center ? h : next,
        );
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        const next = e.relatedTarget;
        if (next instanceof Node && e.currentTarget.contains(next)) return;
        setHover(NO_HOVER);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        const tab = read(e);
        setHover(NO_HOVER);
        dragging = null;
        if (!tab || tab.path !== path) return;
        e.preventDefault();
        const h = resolve(tab, e.currentTarget, e.clientX, e.clientY);
        if (h.edge) onDrop(tab, undefined, h.edge);
        else if (h.insert !== null) onDrop(tab, h.insert, null);
        else if (h.center) onDrop(tab, undefined, null);
      },
    },
  };
}

interface DropOptions {
  path: string | null;
  cell: string;
  keys: string[];
  accept: (tab: DraggedTab) => boolean;
  onDrop: (tab: DraggedTab, index: number | undefined) => void;
}

export function useTabDrop({ path, cell, keys, accept, onDrop }: DropOptions) {
  const [over, setOver] = useState(false);
  const [insert, setInsert] = useState<number | null>(null);
  const reset = () => {
    setOver(false);
    setInsert(null);
  };
  useEffect(() => {
    if (!over && insert === null) return;
    const off = () => {
      setOver(false);
      setInsert(null);
    };
    window.addEventListener('dragend', off);
    return () => window.removeEventListener('dragend', off);
  }, [over, insert]);
  const markerAt = (tab: DraggedTab, index: number | null) => {
    if (index === null || tab.path !== path) return null;
    const at = keys.indexOf(tab.key);
    if (tab.cell === cell && at >= 0 && (index === at || index === at + 1)) return null;
    return index;
  };
  return {
    over,
    insert,
    props: {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(TYPE) || !dragging || !accept(dragging)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const self = dragging.cell === cell;
        setOver(!self);
        setInsert(markerAt(dragging, indexAt(e.currentTarget, e.clientX, e.clientY)));
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        const next = e.relatedTarget;
        if (next instanceof Node && e.currentTarget.contains(next)) return;
        reset();
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        const tab = read(e);
        const index = indexAt(e.currentTarget, e.clientX, e.clientY);
        reset();
        dragging = null;
        if (!tab || !accept(tab)) return;
        e.preventDefault();
        const marker = markerAt(tab, index);
        if (tab.cell === cell && marker === null) return;
        onDrop(tab, marker ?? undefined);
      },
    },
  };
}
