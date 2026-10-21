export function menuPoint(e: React.MouseEvent): { x: number; y: number } {
  if (e.clientX !== 0 || e.clientY !== 0) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + 24, y: r.top + r.height / 2 };
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  originX: number;
  originY: number;
}

const MENU_EDGE = 8;
const SUBMENU_GAP = 4;
const MENU_PAD = 6;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

function axis(p: number, size: number, limit: number): number {
  if (p + size <= limit - MENU_EDGE) return p;
  if (p - size >= MENU_EDGE) return p - size;
  return Math.max(MENU_EDGE, limit - MENU_EDGE - size);
}

export function menuPlacement(
  x: number,
  y: number,
  w: number,
  h: number,
  viewport: Viewport,
): Placement {
  const left = axis(x, w, viewport.width);
  const top = axis(y, h, viewport.height);
  return { left, top, originX: clamp(x - left, 0, w), originY: clamp(y - top, 0, h) };
}

export function submenuPlacement(
  menu: { left: number; right: number },
  itemTop: number,
  w: number,
  h: number,
  viewport: Viewport,
): Placement {
  const right = menu.right + SUBMENU_GAP;
  const fitsRight = right + w <= viewport.width - MENU_EDGE;
  const left = fitsRight ? right : Math.max(MENU_EDGE, menu.left - SUBMENU_GAP - w);
  const top = clamp(
    itemTop - MENU_PAD,
    MENU_EDGE,
    Math.max(MENU_EDGE, viewport.height - MENU_EDGE - h),
  );
  return { left, top, originX: fitsRight ? 0 : w, originY: clamp(itemTop - top, 0, h) };
}

export function installNativeMenuGuard(allowWithShift: boolean): () => void {
  const onContextMenu = (e: MouseEvent) => {
    if (allowWithShift && e.shiftKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return;
    if (window.getSelection()?.toString()) return;
    e.preventDefault();
  };
  window.addEventListener('contextmenu', onContextMenu);
  return () => window.removeEventListener('contextmenu', onContextMenu);
}
