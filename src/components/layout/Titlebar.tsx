import { ECHO_MARK_PATH } from './echoMarkPath';
import { WindowControls } from './WindowControls';

export function EchoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d={ECHO_MARK_PATH} fill="currentColor" />
    </svg>
  );
}

export function Titlebar() {
  return (
    <header data-tauri-drag-region className="flex h-12 shrink-0 items-center pr-4 pl-5">
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 select-none [&>*]:pointer-events-none"
      >
        <EchoMark className="h-4 w-4 text-[var(--color-accent)] drop-shadow-[0_0_6px_var(--color-glow-strong)]" />
        <span className="text-sm font-bold tracking-[-0.01em] text-[var(--color-text-primary)]">
          Echo Studio
        </span>
      </div>
      <div data-tauri-drag-region className="min-w-12 flex-1 self-stretch" />
      <WindowControls />
    </header>
  );
}
