import { cn } from '@/lib/cn';
import { type AppTab, useUiStore } from '@/state/ui-store';

const tabs: { id: AppTab; label: string }[] = [
  { id: 'memories', label: 'Memories' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'settings', label: 'Settings' },
];

export function TabBar() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-3">
      <div className="flex items-baseline gap-2 px-3">
        <span className="text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">
          Echo Studio
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">v0.1.0</span>
      </div>
      <nav className="ml-4 flex items-center gap-1">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              activeTab === t.id
                ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <span className="ml-auto h-2 w-2 rounded-full bg-[var(--color-accent)]" />
    </header>
  );
}
