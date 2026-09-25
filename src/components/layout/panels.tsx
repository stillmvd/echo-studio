import { Separator } from 'react-resizable-panels';

export const panelCard = 'panel-card overflow-hidden rounded-[28px] bg-[var(--color-bg-secondary)]';

export function PanelSeparator() {
  return (
    <Separator className="relative w-2 outline-none before:absolute before:inset-y-7 before:left-1/2 before:w-px before:-translate-x-1/2 before:rounded-full before:transition-colors hover:before:bg-[var(--color-accent)] focus-visible:before:bg-[var(--color-accent)] data-[separator=active]:before:bg-[var(--color-accent)]" />
  );
}
