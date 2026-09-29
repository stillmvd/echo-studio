import { Archive } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { focusRing } from './kinds';

export function UndoToast({
  message,
  error,
  busy,
  onUndo,
  onDismiss,
}: {
  message: string;
  error: string | null;
  busy: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className="absolute bottom-7 left-1/2 z-30 flex h-12 max-w-[calc(100%-48px)] -translate-x-1/2 items-center gap-3.5 rounded-full bg-[var(--color-text-primary)] pr-2 pl-[18px] text-[13px] font-medium whitespace-nowrap text-[var(--color-bg-primary)] shadow-[0_12px_32px_rgb(0_0_0/35%)]"
    >
      <Archive className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 truncate">{error ?? message}</span>
      {!error && (
        <button
          type="button"
          disabled={busy}
          onClick={onUndo}
          className={cn(
            'inline-flex h-8 shrink-0 items-center rounded-full bg-[color-mix(in_srgb,var(--color-bg-primary)_16%,transparent)] px-3.5 font-bold active:scale-[.96] disabled:opacity-50',
            focusRing,
          )}
        >
          Отменить
        </button>
      )}
    </div>
  );
}
