import { useMemoriesList } from '@/hooks/use-memories';
import { useUiStore } from '@/state/ui-store';
import { MemoriesLayout } from './MemoriesLayout';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';

export function AppShell() {
  const activeTab = useUiStore((s) => s.activeTab);
  const summary = useMemoriesList({ limit: 1, status: 'all' });

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <TabBar />
      <main className="flex-1 overflow-hidden">
        {activeTab === 'memories' && <MemoriesLayout />}
        {activeTab === 'conversations' && <Placeholder label="Conversations — Phase 7-9" />}
        {activeTab === 'settings' && <Placeholder label="Settings — Phase 10" />}
      </main>
      <StatusBar
        total={summary.data?.total}
        memoryHome={summary.data?.memoryHome}
        homeSource={summary.data?.homeSource}
      />
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
      {label}
    </div>
  );
}
