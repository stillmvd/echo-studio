import { useEffect, useRef, useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { FLAT_VIEWBOX, isFlat, LIVE_COLOR, type LiveLook } from '@/lib/live-status';

type Engine = typeof import('./engine');

let engine: Promise<Engine> | null = null;
let off = false;
const listeners = new Set<() => void>();

function setOff(next: boolean) {
  off = next;
  for (const l of listeners) l();
}

function loadEngine(): Promise<Engine> {
  engine ??= import('./engine').then(
    (e) => {
      e.onLost(setOff);
      return e;
    },
    (err) => {
      setOff(true);
      throw err;
    },
  );
  return engine;
}

function useGlOff() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => off,
  );
}

function DevErr({ c }: { c: string }) {
  return (
    <g>
      <path
        d="M0 -8.6 L9 7.4 L-9 7.4 Z"
        fill={c}
        stroke={c}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <rect x="-1.3" y="-3.6" width="2.6" height="6" rx="1.3" fill="#2a1600" />
      <circle cy="5" r="1.4" fill="#2a1600" />
      <animate attributeName="opacity" values="1;.45;1" dur="1.6s" repeatCount="indefinite" />
    </g>
  );
}

function DevDown({ c }: { c: string }) {
  return (
    <>
      <circle r="9" fill={c} />
      <polyline
        points="-6.4,0.5 -3,0.5 -1.5,-4 0.6,4.6 2.1,0.5 6.4,0.5"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="1;0;0"
          keyTimes="0;.3;1"
          dur="3.2s"
          repeatCount="indefinite"
        />
      </polyline>
    </>
  );
}

function Flat({ look }: { look: LiveLook }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => (reduce.matches ? svg.pauseAnimations() : svg.unpauseAnimations());
    sync();
    reduce.addEventListener('change', sync);
    return () => reduce.removeEventListener('change', sync);
  }, []);
  const c = LIVE_COLOR[look];
  return (
    <svg ref={ref} viewBox={isFlat(look) ? FLAT_VIEWBOX[look] : '-12 -12 24 24'} aria-hidden="true">
      {look === 'dev_err' ? (
        <DevErr c={c} />
      ) : look === 'dev_down' ? (
        <DevDown c={c} />
      ) : (
        <circle r="8.2" fill={c} />
      )}
    </svg>
  );
}

export function LiveIcon({
  look,
  size,
  title,
  className,
}: {
  look: LiveLook;
  size: number;
  title?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const glOff = useGlOff();
  const flat = isFlat(look) || glOff;

  useEffect(() => {
    const el = ref.current;
    if (flat || !el) return;
    let unregister: (() => void) | undefined;
    let gone = false;
    loadEngine()
      .then((e) => {
        if (!gone) unregister = e.register(el, look);
      })
      .catch(() => {});
    return () => {
      gone = true;
      unregister?.();
    };
  }, [flat, look]);

  return (
    <span
      ref={ref}
      className={cn('live-ico', className)}
      style={{ width: size, height: size }}
      title={title}
      data-look={look}
    >
      {flat && <Flat look={look} />}
    </span>
  );
}
