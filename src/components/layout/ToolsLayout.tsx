import { panelCard } from './panels';

export function ToolsLayout() {
  return (
    <div className={`${panelCard} grid h-full place-items-center`}>
      <p className="text-sm text-[var(--color-text-muted)]">Coming next</p>
    </div>
  );
}
