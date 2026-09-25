import { type LucideIcon, MessageSquare, NotebookText, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';
import { type AppTab, useUiStore } from '@/state/ui-store';

const sections: { id: AppTab; label: string; Icon: LucideIcon }[] = [
  { id: 'memories', label: 'Memories', Icon: NotebookText },
  { id: 'conversations', label: 'Conversations', Icon: MessageSquare },
];

function RailButton({ id, label, Icon }: { id: AppTab; label: string; Icon: LucideIcon }) {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const active = activeTab === id;

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={() => setActiveTab(id)}
      className={cn(
        'grid h-11 w-11 place-items-center rounded-full transition-[background-color,color,transform] duration-200 ease-[var(--ease-trail)] active:scale-96 motion-reduce:transition-none motion-reduce:active:scale-100',
        active
          ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]',
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}

export function NavRail() {
  return (
    <nav aria-label="Sections" className="flex w-14 shrink-0 flex-col items-center gap-2 pb-3">
      {sections.map((s) => (
        <RailButton key={s.id} {...s} />
      ))}
      <div className="mt-auto">
        <RailButton id="settings" label="Settings" Icon={Settings} />
      </div>
    </nav>
  );
}
