import { CircleAlert, CircleCheck } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { type Toast, useToastStore } from '@/state/toast-store';

const SHOW_MS = { done: 3500, fail: 7000 };

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
      className="flex min-h-12 max-w-full animate-[toast-in_220ms_var(--ease-trail)] items-center gap-3 rounded-full bg-[var(--color-text-primary)] py-2 pr-5 pl-[18px] text-left text-[13px] font-medium text-[var(--color-bg-primary)] shadow-[0_12px_32px_rgb(0_0_0/35%)] motion-reduce:animate-none"
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
  if (toasts.length === 0) return null;
  return createPortal(
    <div
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
