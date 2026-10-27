import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const s = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, px: 0, w: 0, h: 0, tilt: 0, last: 0, frame: 0 };
const m = {
  on: false,
  calm: false,
  zone: null as HTMLElement | null,
  muted: null as HTMLElement | null,
};
let layer: HTMLDivElement | null = null;
let show: ((content: ReactNode) => void) | null = null;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const spot = (): [number, number] => {
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

export function cursorCard(content: ReactNode) {
  return {
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const el = e.currentTarget;
      if (e.pointerType !== 'mouse' || !layer || !show || el === m.muted) return;
      s.tx = e.clientX;
      s.ty = e.clientY;
      if (!m.on || (m.zone !== el && !el.contains(m.zone))) {
        const set = show;
        flushSync(() => set(content));
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
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (m.muted === e.currentTarget) m.muted = null;
      if (m.zone === e.currentTarget) hide();
    },
  };
}

export function CursorLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<ReactNode>(null);
  useEffect(() => {
    layer = ref.current;
    show = setContent;
    return () => {
      hide();
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      layer = null;
      show = null;
    };
  }, []);
  return (
    <div ref={ref} aria-hidden className="cc-layer">
      <div className="cc-card">{content}</div>
    </div>
  );
}
