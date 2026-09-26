import { useUiStore } from '@/state/ui-store';
import { ConversationsLayout } from './ConversationsLayout';
import { NavRail } from './NavRail';
import { SettingsLayout } from './SettingsLayout';
import { StatusBar } from './StatusBar';
import { Titlebar } from './Titlebar';
import { ToolsLayout } from './ToolsLayout';

export function AppShell() {
  const activeTab = useUiStore((s) => s.activeTab);

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Titlebar />
      <div className="flex min-h-0 flex-1 pt-2">
        <NavRail />
        <main className="relative min-w-0 flex-1 pr-2 pb-2">
          {activeTab === 'tools' && <ToolsLayout />}
          {activeTab === 'conversations' && <ConversationsLayout />}
          {activeTab === 'settings' && <SettingsLayout />}
          <StatusBar />
        </main>
      </div>
    </div>
  );
}
