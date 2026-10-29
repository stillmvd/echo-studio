import { UpdateBadge } from '@stillmvd/tauri-ship';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef } from 'react';
import { ECHO_MARK_PATH } from './echoMarkPath';
import { WindowControls } from './WindowControls';

const DRAG_PX = 4;

export function EchoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d={ECHO_MARK_PATH} fill="currentColor" />
    </svg>
  );
}

function grab(e: MouseEvent) {
  if (e.button !== 0 || (e.target as Element).closest('button, a, [role="button"]')) return;
  e.preventDefault();
  const win = getCurrentWindow();
  if (e.detail === 2) {
    void win.toggleMaximize();
    return;
  }
  const { screenX: x, screenY: y } = e;
  const stop = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', stop);
  };
  const move = (m: MouseEvent) => {
    if (!(m.buttons & 1)) return stop();
    if (Math.abs(m.screenX - x) + Math.abs(m.screenY - y) < DRAG_PX) return;
    stop();
    void win.startDragging();
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', stop);
}

export function Titlebar() {
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = bar.current;
    el?.addEventListener('mousedown', grab);
    return () => el?.removeEventListener('mousedown', grab);
  }, []);
  return (
    <header ref={bar} className="flex h-12 shrink-0 items-center pr-4 pl-5 select-none">
      <div className="flex items-center gap-2">
        <EchoMark className="h-4 w-4 text-[var(--color-accent)] drop-shadow-[0_0_6px_var(--color-glow-strong)]" />
        <span className="text-sm font-bold tracking-[-0.01em] text-[var(--color-text-primary)]">
          Echo Studio
        </span>
      </div>
      <div className="min-w-12 flex-1 self-stretch" />
      <span className="mr-3 flex empty:hidden">
        <UpdateBadge lang="ru" />
      </span>
      <WindowControls />
    </header>
  );
}
