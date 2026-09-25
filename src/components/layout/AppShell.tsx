import { useMemoriesList } from '@/hooks/use-memories';
import { useUiStore } from '@/state/ui-store';
import { ConversationsLayout } from './ConversationsLayout';
import { MemoriesLayout } from './MemoriesLayout';
import { NavRail } from './NavRail';
import { SettingsLayout } from './SettingsLayout';
import { StatusBar } from './StatusBar';
import { Titlebar } from './Titlebar';

export function AppShell() {
  const activeTab = useUiStore((s) => s.activeTab);
  const summary = useMemoriesList({ limit: 1, status: 'all' });

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Titlebar />
      <div className="flex min-h-0 flex-1 pt-2">
        <NavRail />
        <main className="relative min-w-0 flex-1 pr-2 pb-2">
          {activeTab === 'memories' && <MemoriesLayout />}
          {activeTab === 'conversations' && <ConversationsLayout />}
          {activeTab === 'settings' && <SettingsLayout />}
          <StatusBar total={summary.data?.total} />
        </main>
      </div>
    </div>
  );
}
