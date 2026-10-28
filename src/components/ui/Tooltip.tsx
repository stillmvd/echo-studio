import {
  type FocusEvent,
  type PointerEvent,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

type Side = 'right' | 'bottom';
type Tip = { label: string; rect: DOMRect; side: Side };

const SHOW_DELAY_MS = 400;
const HIDE_DELAY_MS = 90;
const WARM_MS = 500;
const GAP = 10;
const EDGE = 8;

let tip: Tip | null = null;
let hiddenAt = -Infinity;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
const subs = new Set<() => void>();

function set(next: Tip | null) {
  tip = next;
  for (const f of subs) f();
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

function showTip(el: HTMLElement, label: string, side: Side) {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  const go = () => set({ label, rect: el.getBoundingClientRect(), side });
  if (tip || performance.now() - hiddenAt < WARM_MS) go();
  else showTimer = setTimeout(go, SHOW_DELAY_MS);
}

function hideTip(now = false) {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  const go = () => {
    if (!tip) return;
    hiddenAt = performance.now();
    set(null);
  };
  if (now) go();
  else hideTimer = setTimeout(go, HIDE_DELAY_MS);
}

export function tooltip(label: string, side: Side = 'right') {
  return {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'touch') showTip(e.currentTarget, label, side);
    },
    onPointerLeave: () => hideTip(),
    onPointerDown: () => hideTip(true),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(':focus-visible')) showTip(e.currentTarget, label, side);
    },
    onBlur: () => hideTip(true),
  };
}

export function TooltipLayer() {
  const t = useSyncExternalStore(subscribe, () => tip);
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !t) return;
    box.style.marginLeft = '0px';
    const r = box.getBoundingClientRect();
    const over = r.right - (window.innerWidth - EDGE);
    const under = EDGE - r.left;
    box.style.marginLeft = `${over > 0 ? -over : under > 0 ? under : 0}px`;
  }, [t]);

  useLayoutEffect(() => {
    const hide = () => hideTip(true);
    window.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('blur', hide);
    window.addEventListener('keydown', hide);
    return () => {
      window.removeEventListener('wheel', hide);
      window.removeEventListener('blur', hide);
      window.removeEventListener('keydown', hide);
    };
  }, []);

  if (!t) return null;
  const right = t.side === 'right';
  const x = right ? t.rect.right + GAP : t.rect.left + t.rect.width / 2;
  const y = right ? t.rect.top + t.rect.height / 2 : t.rect.bottom + GAP;

  return createPortal(
    <div role="tooltip" className="tip" data-side={t.side} style={{ left: x, top: y }}>
      <div ref={boxRef} className="tip-box">
        <span key={t.label} className="tip-l">
          {t.label}
        </span>
      </div>
    </div>,
    document.body,
  );
}
