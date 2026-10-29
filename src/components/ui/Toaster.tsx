import type { AutoAnimationPlugin } from '@formkit/auto-animate';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Check, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { type Toast, useToastStore } from '@/state/toast-store';

const SHOW_MS = { done: 4000, fail: 7000 };
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const POP = 'cubic-bezier(0.34, 1.45, 0.64, 1)';

const motion: AutoAnimationPlugin = (el, action, next, prev) => {
  if (action === 'add')
    return new KeyframeEffect(
      el,
      [
        { opacity: 0, transform: 'translateY(18px) scale(0.9)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 360, easing: POP },
    );
  if (action === 'remove')
    return new KeyframeEffect(
      el,
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(10px) scale(0.92)' },
      ],
      { duration: 200, easing: EASE },
    );
  const dy = (prev?.top ?? 0) - (next?.top ?? 0);
  return new KeyframeEffect(el, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
    duration: 280,
    easing: EASE,
  });
};

function Item({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    if (!still()) return;
    const t = setTimeout(() => dismiss(toast.id), SHOW_MS[toast.tone]);
    return () => clearTimeout(t);
  }, [toast, dismiss]);
  const Icon = toast.tone === 'fail' ? X : Check;
  return (
    <button
      type="button"
      className="toast"
      data-tone={toast.tone}
      onClick={() => dismiss(toast.id)}
      onAnimationEnd={(e) => e.animationName === 'toast-life' && dismiss(toast.id)}
    >
      <span className="toast-ic">
        <Icon strokeWidth={2.5} />
      </span>
      <span className="toast-tx">{toast.text}</span>
      <i className="toast-bar" style={{ animationDuration: `${SHOW_MS[toast.tone]}ms` }} />
    </button>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const [list] = useAutoAnimate<HTMLDivElement>(motion);
  return createPortal(
    <div
      ref={list}
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-7 z-[60] flex flex-col items-center gap-2 px-6 [&>*]:pointer-events-auto"
    >
      {toasts.map((t) => (
        <Item key={t.id} toast={t} />
      ))}
    </div>,
    document.body,
  );
}
