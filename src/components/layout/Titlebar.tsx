import { WindowControls } from './WindowControls';

function EchoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <circle cx="4" cy="8" r="1.9" fill="currentColor" />
      <path
        d="M7.2 4.6a4.8 4.8 0 0 1 0 6.8M10.2 2.4a8 8 0 0 1 0 11.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
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
