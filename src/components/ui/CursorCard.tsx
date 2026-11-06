import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

type Kind = 'card' | 'text' | 'line';
type Shown = { content: ReactNode; kind: Kind };

const s = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, px: 0, w: 0, h: 0, tilt: 0, last: 0, frame: 0 };
const m = {
  on: false,
  calm: false,
  auto: false,
  right: false,
  text: '',
  zone: null as HTMLElement | null,
  muted: null as HTMLElement | null,
};
let layer: HTMLDivElement | null = null;
let show: ((shown: Shown) => void) | null = null;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const spot = (): [number, number] => {
  if (m.right) return [s.tx + 18, Math.max(8, Math.min(innerHeight - s.h - 8, s.ty - s.h / 2))];
  const y = s.ty - s.h - 14;
  return [Math.max(8, Math.min(innerWidth - s.w - 8, s.tx - s.w / 2)), y < 8 ? s.ty + 22 : y];
};

const step = (now: number) => {
  if (!layer) {
    s.frame = 0;
    return;
  }
  const dt = Math.min(1 / 30, Math.max(0, (now - s.last) / 1000)) || 1 / 60;
  s.last = now;
  const [tx, ty] = spot();
  if (m.calm) {
    s.x = tx;
    s.y = ty;
  } else {
    s.vx += ((-220 * (s.x - tx) - 26 * s.vx) / 0.7) * dt;
    s.vy += ((-220 * (s.y - ty) - 26 * s.vy) / 0.7) * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }
  const want = m.calm ? 0 : Math.max(-6, Math.min(6, (s.tx - s.px) / dt / 70));
  s.px = s.tx;
  s.tilt += (want - s.tilt) * Math.min(1, dt * 10);
  layer.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.tilt.toFixed(2)}deg)`;
  const busy =
    Math.abs(s.vx) + Math.abs(s.vy) > 0.5 ||
    Math.abs(s.x - tx) + Math.abs(s.y - ty) > 0.2 ||
    Math.abs(s.tilt) > 0.02;
  s.frame = busy ? requestAnimationFrame(step) : 0;
};

const hide = () => {
  m.on = false;
  m.zone = null;
  layer?.toggleAttribute('data-on', false);
  removeEventListener('pointerdown', mute, true);
  removeEventListener('pointerover', away, true);
};
const mute = () => {
  m.muted = m.zone;
  hide();
};
const away = (e: Event) => {
  if (!m.zone?.contains(e.target as Node)) hide();
};

function track(el: HTMLElement, x: number, y: number, content: ReactNode, kind: Kind) {
  if (!layer || !show) return;
  s.tx = x;
  s.ty = y;
  if (!m.on || m.zone !== el) {
    const set = show;
    flushSync(() => set({ content, kind }));
    const inner = layer.firstElementChild as HTMLElement;
    s.w = inner.offsetWidth;
    s.h = inner.offsetHeight;
    if (!m.on) {
      s.px = s.tx;
      [s.x, s.y] = spot();
      s.vx = s.vy = s.tilt = 0;
      m.on = true;
      m.calm = reduced();
      layer.toggleAttribute('data-on', true);
      addEventListener('pointerdown', mute, true);
      addEventListener('pointerover', away, true);
    }
    m.zone = el;
  }
  if (!s.frame) {
    s.last = performance.now();
    s.frame = requestAnimationFrame(step);
  }
}

export function cursorCard(content: ReactNode, kind: Kind = 'card') {
  return {
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const el = e.currentTarget;
      if (e.pointerType !== 'mouse' || el === m.muted) return;
      if (m.zone && m.zone !== el && el.contains(m.zone)) return;
      m.auto = false;
      m.right = false;
      track(el, e.clientX, e.clientY, content, kind);
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (m.muted === e.currentTarget) m.muted = null;
      if (m.zone === e.currentTarget) hide();
    },
  };
}

function onMove(e: globalThis.PointerEvent) {
  if (e.pointerType !== 'mouse') return;
  const target = e.target instanceof Element ? e.target : null;
  if (m.muted && !m.muted.contains(target)) m.muted = null;
  if (m.on && !m.auto) return;
  const el = target?.closest<HTMLElement>('[data-tip], [data-tip-trunc]') ?? null;
  const text =
    (el?.dataset.tip ?? (el && el.scrollWidth > el.clientWidth ? el.textContent : ''))?.trim() ??
    '';
  if (!el || !text || el === m.muted) {
    if (m.on && m.auto) hide();
    return;
  }
  if (m.zone === el && m.text !== text) m.zone = null;
  m.auto = true;
  m.right = el.dataset.tipSide === 'right';
  m.text = text;
  track(el, e.clientX, e.clientY, text, 'line');
}

function onOut(e: globalThis.PointerEvent) {
  if (!e.relatedTarget) {
    m.muted = null;
    hide();
  }
}

export function CursorLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    layer = ref.current;
    show = setShown;
    addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    addEventListener('wheel', hide, { passive: true });
    addEventListener('keydown', hide);
    addEventListener('blur', hide);
    return () => {
      hide();
      removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      removeEventListener('wheel', hide);
      removeEventListener('keydown', hide);
      removeEventListener('blur', hide);
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      layer = null;
      show = null;
    };
  }, []);
  return (
    <div ref={ref} aria-hidden className="cc-layer">
      <div
        className="cc-card"
        data-kind={shown?.kind ?? 'card'}
        data-side={m.right ? 'right' : undefined}
      >
        {shown?.content}
      </div>
    </div>
  );
}
