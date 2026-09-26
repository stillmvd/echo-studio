import { useToolingWatch } from '@/hooks/use-tooling';

export function StatusBar() {
  useToolingWatch();
  return (
    <div
      role="status"
      title="Watching Claude config for changes"
      className="absolute right-6 bottom-6 z-20 flex h-11 items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 text-xs font-medium whitespace-nowrap text-[var(--color-text-muted)] shadow-[0_10px_26px_rgb(0_0_0/30%)]"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-success)] shadow-[0_0_8px_rgb(95_201_138/55%)]" />
      watching
    </div>
  );
}
