import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  initialValue: string;
  fallbackTitle: string;
  busy?: boolean;
  onSubmit: (title: string | null) => void;
  onCancel: () => void;
}

export function RenameSessionDialog({
  open,
  initialValue,
  fallbackTitle,
  busy,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      const t = setTimeout(() => inputRef.current?.select(), 30);
      return () => clearTimeout(t);
    }
  }, [open, initialValue]);

  if (!open) return null;

  const submit = () => {
    const trimmed = value.trim();
    onSubmit(trimmed.length > 0 ? trimmed : null);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click closes; Esc handled in input
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          Rename conversation
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Имя видно только в Echo Studio — исходный файл сессии не меняется.
        </p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) submit();
            if (e.key === 'Escape' && !busy) onCancel();
          }}
          placeholder={fallbackTitle}
          className="mt-3 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
        />
        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Очистите поле и сохраните, чтобы вернуть исходное имя.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-[var(--color-border-subtle)] bg-transparent px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
