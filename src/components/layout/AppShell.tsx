import { UpdateToast } from '@stillmvd/tauri-ship';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { LeaveGuard } from '@/components/memory/LeaveGuard';
import { CursorLayer } from '@/components/ui/CursorCard';
import { Toaster } from '@/components/ui/Toaster';
import { TooltipLayer } from '@/components/ui/Tooltip';
import { WorkbenchLayout } from '@/components/workbench/WorkbenchLayout';
import { useToolingWatch } from '@/hooks/use-tooling';
import { useUiStore } from '@/state/ui-store';
import { ConversationsLayout } from './ConversationsLayout';
import { MemoryLayout } from './MemoryLayout';
import { NavRail } from './NavRail';
import { SettingsLayout } from './SettingsLayout';
import { Titlebar } from './Titlebar';
import { ToolsLayout } from './ToolsLayout';

export function AppShell() {
  const activeTab = useUiStore((s) => s.activeTab);
  useToolingWatch();

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Titlebar />
      <div className="flex min-h-0 flex-1 pt-2">
        <NavRail />
        <main className="relative min-w-0 flex-1 pr-2 pb-2">
          <WorkbenchLayout hidden={activeTab !== 'workbench'} />
          {activeTab === 'dashboard' && <DashboardLayout />}
          {activeTab === 'tools' && <ToolsLayout />}
          {activeTab === 'memory' && <MemoryLayout />}
          {activeTab === 'conversations' && <ConversationsLayout />}
          {activeTab === 'settings' && <SettingsLayout />}
        </main>
      </div>
      <LeaveGuard />
      <CursorLayer />
      <TooltipLayer />
      <UpdateToast lang="ru" />
      <Toaster />
    </div>
  );
}
