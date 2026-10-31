import { type CSSProperties, type ReactNode, useId, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { LIVE_COLOR, type LiveLook } from '@/lib/live-status';
import { isWindowActive, onWindowActive } from '@/lib/window-activity';

function gear(ro: number, ri: number, teeth: number) {
  const step = (Math.PI * 2) / teeth;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [k, r] of [
      [-0.5, ri],
      [-0.24, ri],
      [-0.15, ro],
      [0.15, ro],
      [0.24, ri],
    ] as const) {
      const x = 24 + Math.cos(a + k * step) * r;
      const y = 24 + Math.sin(a + k * step) * r;
      pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
    }
  }
  return `M${pts.join(' L')} Z M24 19.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9Z`;
}

const GEAR = gear(15.5, 11.5, 8);
const BELL = 'M24 10c-5.6 0-9 4.2-9 9.8v5.6l-3 4.1h24l-3-4.1v-5.6C33 14.2 29.6 10 24 10Z';
const BUBBLE =
  'M14 12h20a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5H23l-7 5v-5h-2a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5Z';
const TRI = 'M24 10.5 38.5 35.5h-29Z';
const DOTS = [14.5, 24, 33.5];
const BARS = [16, 24, 32];
const SOLID = {
  fill: 'currentColor',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinejoin: 'round',
} as const;
const CUT = { stroke: '#000', strokeWidth: 3, strokeLinecap: 'round', fill: 'none' } as const;

function Layer({
  motion,
  origin,
  delay,
  style,
  children,
}: {
  motion?: string;
  origin?: [number, number];
  delay?: number;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <i
      className={motion}
      style={{
        ...style,
        transformOrigin: origin
          ? `${(origin[0] / 48) * 100}% ${(origin[1] / 48) * 100}%`
          : undefined,
        animationDelay: delay ? `${delay}s` : undefined,
      }}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        {children}
      </svg>
    </i>
  );
}

function Cut({ id, children, cut }: { id: string; children: ReactNode; cut: ReactNode }) {
  return (
    <>
      <mask id={id}>
        <rect width="48" height="48" fill="#fff" />
        {cut}
      </mask>
      <g mask={`url(#${id})`}>{children}</g>
    </>
  );
}

const cross = (paint: object) => <path d="m19 19 10 10M29 19 19 29" {...paint} />;
const bang = (paint: object, dot: object) => (
  <>
    <path d="M24 20v6.5" {...paint} />
    <circle cx="24" cy="31" r="1.7" {...dot} />
  </>
);
const check = <path d="m17.5 24.5 4.5 4.5 8.5-9" {...CUT} />;

function bars(slow: boolean) {
  return BARS.map((x, i) => (
    <Layer
      key={x}
      motion={slow ? 'lv-bar-slow' : 'lv-bar'}
      origin={[x, 35]}
      delay={(slow ? [0, -1.6, -0.8] : [0, -0.8, -0.4])[i]}
    >
      <rect x={x - 2.75} y="13" width="5.5" height="22" rx="2.75" fill="currentColor" />
    </Layer>
  ));
}

function Glyph({ look, id }: { look: LiveLook; id: string }) {
  switch (look) {
    case 'idle':
      return (
        <Layer>
          <circle cx="24" cy="24" r="11.5" fill="currentColor" />
        </Layer>
      );
    case 'still':
      return (
        <Layer style={{ opacity: 0.5 }}>
          <Cut id={id} cut={<path d="M18.5 24h11" {...CUT} strokeWidth={2.4} />}>
            <circle cx="24" cy="24" r="11.5" fill="currentColor" />
          </Cut>
        </Layer>
      );
    case 'thinking':
      return (
        <>
          <Layer>
            <Cut
              id={id}
              cut={DOTS.map((x) => <circle key={x} cx={x} cy="22.5" r="3" fill="#000" />)}
            >
              <path d={BUBBLE} {...SOLID} />
            </Cut>
          </Layer>
          {DOTS.map((x, i) => (
            <Layer key={x} motion="lv-plug" delay={[0, -0.8, -0.4][i]}>
              <circle cx={x} cy="22.5" r="3" fill="currentColor" />
            </Layer>
          ))}
        </>
      );
    case 'tool':
      return (
        <Layer motion="lv-spin">
          <path d={GEAR} {...SOLID} fillRule="evenodd" />
        </Layer>
      );
    case 'agents':
      return (
        <>
          <Layer>
            <circle cx="24" cy="24" r="5" fill="currentColor" />
          </Layer>
          <Layer motion="lv-orbit">
            <circle cx="24" cy="10.5" r="4.6" fill="currentColor" />
            <circle cx="35.7" cy="30.8" r="4.6" fill="currentColor" />
            <circle cx="12.3" cy="30.8" r="4.6" fill="currentColor" />
          </Layer>
        </>
      );
    case 'waiting':
      return (
        <Layer motion="lv-swing" origin={[24, 10]}>
          <path d={BELL} {...SOLID} />
          <path d="M20.5 33a3.5 3.5 0 0 0 7 0Z" fill="currentColor" />
        </Layer>
      );
    case 'done':
      return (
        <Layer>
          <Cut id={id} cut={check}>
            <circle cx="24" cy="24" r="13.5" fill="currentColor" />
          </Cut>
        </Layer>
      );
    case 'error':
      return (
        <>
          <Layer>
            <Cut id={id} cut={cross(CUT)}>
              <circle cx="24" cy="24" r="13.5" fill="currentColor" />
            </Cut>
          </Layer>
          <Layer motion="lv-plug-blink">{cross({ ...CUT, stroke: 'currentColor' })}</Layer>
        </>
      );
    case 'dev_run':
      return <>{bars(false)}</>;
    case 'dev_slow':
      return <>{bars(true)}</>;
    case 'dev_err':
      return (
        <>
          <Layer>
            <Cut id={id} cut={bang(CUT, { fill: '#000' })}>
              <path d={TRI} {...SOLID} />
            </Cut>
          </Layer>
          <Layer motion="lv-plug-blink-fast">
            {bang({ ...CUT, stroke: 'currentColor' }, { fill: 'currentColor' })}
          </Layer>
        </>
      );
    case 'dev_down':
      return (
        <Layer motion="lv-fade">
          <rect x="14" y="14" width="20" height="20" rx="5" fill="currentColor" />
        </Layer>
      );
  }
}

const sync = (anims: Animation[]) => {
  const active = isWindowActive();
  for (const a of anims) {
    if (active) a.startTime = 0;
    else a.pause();
  }
};

onWindowActive(() =>
  requestAnimationFrame(() =>
    sync(
      document
        .getAnimations()
        .filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest('.live-ico')),
    ),
  ),
);

export function LiveIcon({
  look,
  size,
  title,
  className,
  dim = false,
}: {
  look: LiveLook;
  size?: number;
  title?: string;
  className?: string;
  dim?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && look) sync(el.getAnimations({ subtree: true }));
  }, [look]);

  return (
    <span
      ref={ref}
      className={cn('live-ico', dim && 'dim', className)}
      style={
        { '--lv': LIVE_COLOR[look], ...(size && { width: size, height: size }) } as CSSProperties
      }
      title={title}
      data-look={look}
    >
      <Glyph look={look} id={`lv${id.replace(/:/g, '')}`} />
    </span>
  );
}
