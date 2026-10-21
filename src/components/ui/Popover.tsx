import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
}

const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const GAP = 6;
const EDGE = 8;

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function frames(above: boolean): Keyframe[] {
  return [
    { opacity: 0, transform: `translateY(${above ? 4 : -4}px) scale(.96)` },
    { opacity: 1, transform: 'none' },
  ];
}

export function Popover({ anchor, open, onClose, label, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const above = useRef(false);
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - width - EDGE));
    const flip = r.bottom + GAP + height > window.innerHeight - EDGE;
    const top = flip ? Math.max(EDGE, r.top - GAP - height) : r.bottom + GAP;
    above.current = flip;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.transformOrigin = `${Math.min(width, Math.max(0, r.left + 16 - left))}px ${flip ? '100%' : '0'}`;
    el.querySelector<HTMLElement>('button, [href]')?.focus();
    if (still()) return;
    const a = el.animate(frames(flip), { duration: 200, easing: EASE });
    return () => a.cancel();
  }, [open, anchor]);

  useEffect(() => {
    if (open || !shown) return;
    const el = ref.current;
    if (el?.contains(document.activeElement) || document.activeElement === document.body) {
      anchor?.focus();
    }
    if (!el || still()) {
      setShown(false);
      return;
    }
    const a = el.animate(frames(above.current).reverse(), {
      duration: 150,
      easing: EASE,
      fill: 'forwards',
    });
    a.finished.then(() => setShown(false)).catch(() => {});
    return () => a.cancel();
  }, [open, shown, anchor]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [open, anchor, onClose]);

  if (!shown) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={cn(
        'fixed top-0 left-0 z-50 w-max max-w-[320px] rounded-[20px] bg-[var(--color-bg-tertiary)] p-4 text-[var(--color-text-primary)] shadow-[0_0_0_1px_var(--color-border),0_14px_34px_rgb(0_0_0/34%)]',
        !open && 'pointer-events-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
