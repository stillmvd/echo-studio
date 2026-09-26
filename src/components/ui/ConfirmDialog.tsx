import { useCallback, useEffect, useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { splitTitle } from '@/lib/sessions';

export interface DialogSubject {
  title: string;
  id?: string;
  chips?: string[];
}

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  wide?: boolean;
  subject?: DialogSubject | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children?: React.ReactNode;
}

const EXIT_MS = 200;

export const dialogButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full px-[18px] text-[13px] whitespace-nowrap outline-none [transition:transform_120ms_var(--ease-trail),background-color_200ms_var(--ease-trail)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-secondary)] active:scale-[.96] disabled:pointer-events-none disabled:opacity-50';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  busy,
  wide,
  subject,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();

  const confirm = useCallback(async () => {
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(String(e));
    }
  }, [onConfirm]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setError(null);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
      if (
        e.key === 'Enter' &&
        !busy &&
        !e.defaultPrevented &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLButtonElement)
      )
        void confirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, confirm, onCancel]);

  if (!mounted) return null;

  const [lead, last] = splitTitle(title);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: ESC closes via keydown handler above
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-6 transition-[opacity,backdrop-filter,background-color] ease-[var(--ease-trail)] motion-reduce:transition-none',
        shown
          ? 'bg-black/[.38] opacity-100 backdrop-blur-[8px] duration-[320ms]'
          : 'pointer-events-none bg-black/0 opacity-0 backdrop-blur-none duration-200',
      )}
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <div
        className={cn(
          'flex max-h-full w-full flex-col gap-[18px] rounded-[28px] bg-[var(--color-bg-secondary)] p-6 shadow-[0_0_0_1px_var(--color-border),0_24px_64px_rgb(0_0_0/45%)] transition-transform ease-[var(--ease-trail)] motion-reduce:transition-none',
          wide ? 'max-w-[540px]' : 'max-w-[440px]',
          shown ? 'translate-y-0 duration-[320ms]' : 'translate-y-3 duration-200',
        )}
      >
        <div className="flex flex-col gap-2">
          <h2
            id={titleId}
            className="text-[22px] leading-[1.06] font-light tracking-[-0.02em] [text-wrap:balance] text-[var(--color-text-primary)]"
          >
            {lead}
            <b className="font-bold">{last}</b>
          </h2>
          {description && (
            <p
              id={descId}
              className="text-[13px] leading-normal font-medium text-[var(--color-text-muted)]"
            >
              {description}
            </p>
          )}
        </div>
        {subject && (
          <div className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-[22px] bg-[var(--color-bg-tertiary)] py-2 pr-2 pl-4 text-[13px] font-medium text-[var(--color-text-primary)]">
            <span className="min-w-0 flex-1 truncate" title={subject.title}>
              {subject.title}
              {subject.id && (
                <span className="ml-2 font-mono text-[11px] font-normal text-[var(--color-text-muted)]">
                  {subject.id}
                </span>
              )}
            </span>
            {subject.chips?.map((c) => (
              <span
                key={c}
                className="inline-flex h-6 shrink-0 items-center rounded-full bg-[var(--color-bg-secondary)] px-[9px] text-[11px] whitespace-nowrap text-[var(--color-text-muted)] tabular-nums"
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {children && (
          <div className="-mr-2 flex min-h-0 flex-col gap-3 overflow-y-auto pr-2">{children}</div>
        )}
        {error && <DialogNote tone="danger">{error}</DialogNote>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={cn(
              dialogButton,
              'bg-[var(--color-bg-tertiary)] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]',
            )}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className={cn(
              dialogButton,
              'font-bold',
              danger
                ? 'bg-[var(--color-danger)] text-[var(--color-bg-primary)] hover:bg-[color-mix(in_srgb,var(--color-danger)_88%,white)]'
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

export function DialogNote({
  tone,
  children,
}: {
  tone: 'danger' | 'accent';
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'rounded-2xl px-4 py-3 font-mono text-xs leading-normal whitespace-pre-wrap [overflow-wrap:anywhere]',
        tone === 'danger'
          ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
          : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
      )}
    >
      {children}
    </p>
  );
}
