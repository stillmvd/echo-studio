import { useMemoriesList } from '@/hooks/use-memories';
import { useUiStore } from '@/state/ui-store';
import { ConversationsLayout } from './ConversationsLayout';
import { MemoriesLayout } from './MemoriesLayout';
import { SettingsLayout } from './SettingsLayout';
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
        {activeTab === 'conversations' && <ConversationsLayout />}
        {activeTab === 'settings' && <SettingsLayout />}
      </main>
      <StatusBar
        total={summary.data?.total}
        memoryHome={summary.data?.memoryHome}
        homeSource={summary.data?.homeSource}
      />
    </div>
  );
}
