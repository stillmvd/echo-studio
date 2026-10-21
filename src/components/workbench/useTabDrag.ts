import { type DragEvent, useEffect, useState } from 'react';

const TYPE = 'text/x-echo-tab';

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
