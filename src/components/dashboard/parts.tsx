import { cn } from '@/lib/cn';
import {
  type Forecast,
  forecast,
  forecastText,
  limitTone,
  resetAt,
  sparkPoints,
  type Tone,
  tone,
} from '@/lib/dashboard';
import { percent } from '@/lib/overview';
import type { Limit } from '@/lib/types';

export function Spark({
  values,
  w,
  h,
  floor = 1,
  t,
  className,
}: {
  values: number[];
  w: number;
  h: number;
  floor?: number;
  t: Tone;
  className?: string;
}) {
  const pts = sparkPoints(values, w, h, floor);
  return (
    <svg
      className={cn('db-spk', `t-${t}`, className)}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {pts && (
        <>
          <polygon points={`0,${h} ${pts} ${w},${h}`} />
          <polyline points={pts} />
        </>
      )}
    </svg>
  );
}

export function Ring({ value, size, stroke }: { value: number; size: number; stroke: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <svg
      className={cn('db-ring', `t-${tone(value)}`)}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle className="tr" cx={mid} cy={mid} r={r} strokeWidth={stroke} />
      <circle
        className="fl"
        cx={mid}
        cy={mid}
        r={r}
        strokeWidth={stroke}
        strokeDasharray={`${((Math.min(value, 100) / 100) * c).toFixed(1)} ${c.toFixed(1)}`}
        transform={`rotate(-90 ${mid} ${mid})`}
      />
    </svg>
  );
}

export function limitView(limit: Limit | null, window: number) {
  const f: Forecast | null = forecast(limit, window);
  return { used: percent(limit), f, t: limitTone(limit, f) };
}

export function LimitBar({
  label,
  limit,
  window,
}: {
  label: string;
  limit: Limit | null;
  window: number;
}) {
  const { used, f, t } = limitView(limit, window);
  const text = forecastText(f);
  return (
    <div className="db-lm">
      <div className="db-lmh">
        <b>{label}</b>
        <span className="wb-dim">{resetAt(limit)}</span>
        <span className={cn('db-lmv', `t-${tone(used ?? 0)}`)}>
          {used === null ? '—' : `${used}%`}
        </span>
      </div>
      <div className="db-lmb">
        {f && <i className={cn('gh', `t-${t}`)} style={{ width: `${f.projected}%` }} />}
        <i className={cn('fl', `t-${tone(used ?? 0)}`)} style={{ width: `${used ?? 0}%` }} />
      </div>
      {text && <span className={cn('db-lmf', `t-${t}`)}>{text}</span>}
    </div>
  );
}
