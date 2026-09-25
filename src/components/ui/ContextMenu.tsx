import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface ContextMenuAction {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export type ContextMenuItem = ContextMenuAction | 'separator';

function keyOf(item: ContextMenuItem | undefined): string {
  return item === undefined || item === 'separator' ? 'start' : item.label;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = Math.min(x, window.innerWidth - rect.width - 8);
    const ny = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
    el.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const attach = window.setTimeout(() => {
      window.addEventListener('mousedown', onDown);
      window.addEventListener('contextmenu', onDown);
      window.addEventListener('blur', onClose);
      window.addEventListener('resize', onClose);
    });
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(attach);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('contextmenu', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const buttons = [
      ...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
    ];
    if (buttons.length === 0) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? buttons.length - 1
          : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-50 flex min-w-[200px] flex-col gap-0.5 rounded-[20px] bg-[var(--color-bg-tertiary)] p-1.5 shadow-[0_0_0_1px_var(--color-border),0_14px_34px_rgb(0_0_0/34%)] outline-none"
    >
      {items.map((item, i) =>
        item === 'separator' ? (
          <hr
            key={`sep-${keyOf(items[i - 1])}`}
            className="mx-2.5 my-[3px] h-px border-0 bg-[var(--color-border)]"
          />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={cn(
              'flex h-9 items-center gap-2.5 rounded-full pr-3.5 pl-3 text-left text-[13px] font-medium whitespace-nowrap outline-none transition-colors duration-120',
              item.danger
                ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] focus-visible:bg-[var(--color-danger-soft)]'
                : 'text-[var(--color-text-primary)] hover:bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)]',
            )}
          >
            {item.icon && (
              <span
                className={cn(
                  'flex h-3.5 w-3.5 shrink-0 items-center justify-center',
                  !item.danger && 'text-[var(--color-text-muted)]',
                )}
              >
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
