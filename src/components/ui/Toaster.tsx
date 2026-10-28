import type { AutoAnimationPlugin } from '@formkit/auto-animate';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { type Toast, useToastStore } from '@/state/toast-store';

const SHOW_MS = { done: 3500, fail: 7000 };
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
    const t = setTimeout(() => dismiss(toast.id), SHOW_MS[toast.tone]);
    return () => clearTimeout(t);
  }, [toast, dismiss]);
  const Icon = toast.tone === 'fail' ? CircleAlert : CircleCheck;
  return (
    <button
      type="button"
      onClick={() => dismiss(toast.id)}
      className="flex min-h-12 max-w-full items-center gap-3 rounded-full bg-[var(--color-text-primary)] py-2 pr-5 pl-[18px] text-left text-[13px] font-medium text-[var(--color-bg-primary)] shadow-[0_12px_32px_rgb(0_0_0/35%)] transition-[scale] duration-150 active:scale-95"
    >
      <Icon
        className={cn(
          'h-[15px] w-[15px] shrink-0',
          toast.tone === 'fail' && 'text-[var(--color-danger)]',
        )}
        strokeWidth={1.75}
      />
      <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{toast.text}</span>
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
