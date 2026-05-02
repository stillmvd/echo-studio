import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  busy,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    else {
      const t = setTimeout(() => setMounted(false), 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
      if (e.key === 'Enter' && !busy) onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onConfirm, onCancel]);

  if (!mounted) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: ESC closes via keydown handler above
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-150',
        open ? 'bg-black/60 opacity-100' : 'bg-black/0 opacity-0 pointer-events-none',
      )}
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          'w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 shadow-2xl transition-transform duration-150',
          open ? 'scale-100' : 'scale-95',
        )}
      >
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
        {description && (
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{description}</p>
        )}
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-[var(--color-border-subtle)] bg-transparent px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
              danger
                ? 'bg-[var(--color-danger)] text-white hover:opacity-90'
                : 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]',
            )}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
