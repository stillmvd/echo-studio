import { Check, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { type Toast, useToastStore } from '@/state/toast-store';

const SHOW_MS = { done: 4000, fail: 7000 };
const GAP = 8;
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const POP = 'cubic-bezier(0.34, 1.3, 0.64, 1)';
const FADE = 'cubic-bezier(0.4, 0, 1, 1)';

function Item({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const remove = useToastStore((s) => s.remove);
  const slot = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const s = slot.current;
    const b = body.current;
    if (!s || !b || still()) return;
    s.animate(
      [
        { height: '0px', marginTop: `-${GAP}px` },
        { height: `${b.offsetHeight}px`, marginTop: '0px' },
      ],
      { duration: 340, easing: EASE },
    );
    b.animate(
      [
        { opacity: 0, transform: 'translateY(14px) scale(0.92)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 440, easing: POP },
    );
  }, []);

  useEffect(() => {
    if (toast.out || !still()) return;
    const t = setTimeout(() => dismiss(toast.id), SHOW_MS[toast.tone]);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  useEffect(() => {
    if (!toast.out) return;
    const s = slot.current;
    const b = body.current;
    if (!s || !b || still()) {
      remove(toast.id);
      return;
    }
    b.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(6px) scale(0.95)' },
      ],
      { duration: 240, easing: FADE, fill: 'forwards' },
    );
    const a = s.animate(
      [
        { height: `${s.offsetHeight}px`, marginTop: '0px' },
        { height: '0px', marginTop: `-${GAP}px` },
      ],
      { duration: 320, delay: 140, easing: EASE, fill: 'forwards' },
    );
    a.onfinish = () => remove(toast.id);
    return () => {
      a.onfinish = null;
    };
  }, [toast.out, toast.id, remove]);

  const Icon = toast.tone === 'fail' ? X : Check;
  return (
    <div ref={slot} className="toast-slot" data-out={toast.out || undefined}>
      <button
        ref={body}
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
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return createPortal(
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-7 z-[60] flex flex-col items-center gap-2 px-6"
    >
      {toasts.map((t) => (
        <Item key={t.id} toast={t} />
      ))}
    </div>,
    document.body,
  );
}
