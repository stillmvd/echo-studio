import { LeaveGuard } from '@/components/memory/LeaveGuard';
import { useUiStore } from '@/state/ui-store';
import { ConversationsLayout } from './ConversationsLayout';
import { MemoryLayout } from './MemoryLayout';
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
          {activeTab === 'memory' && <MemoryLayout />}
          {activeTab === 'conversations' && <ConversationsLayout />}
          {activeTab === 'settings' && <SettingsLayout />}
          <StatusBar />
        </main>
      </div>
      <LeaveGuard />
    </div>
  );
}
