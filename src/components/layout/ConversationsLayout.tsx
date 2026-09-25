import { Group, Panel, useDefaultLayout } from 'react-resizable-panels';
import { ConversationsProjectSidebar } from '@/components/conversations/ConversationsProjectSidebar';
import { CrossSessionSearch } from '@/components/conversations/CrossSessionSearch';
import { SessionTable } from '@/components/conversations/SessionTable';
import { SessionViewer } from '@/components/conversations/SessionViewer';
import { useConversationProjects, useConversationSessions } from '@/hooks/use-conversations';
import { sessionDisplayTitle } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { PanelSeparator, panelCard } from './panels';

export function ConversationsLayout() {
  const projectId = useUiStore((s) => s.conversationsProjectId);
  const setProjectId = useUiStore((s) => s.setConversationsProjectId);
  const selectedSessionPath = useUiStore((s) => s.selectedSessionPath);
  const setSelectedSessionPath = useUiStore((s) => s.setSelectedSessionPath);

  const layout = useDefaultLayout({
    id: 'echo-studio.conversations.panel-sizes',
    storage: localStorage,
  });
  const projects = useConversationProjects();
  const sessions = useConversationSessions(projectId);

  const selectedProject = projects.data?.find((p) => p.id === projectId) ?? null;
  const selectedSession = sessions.data?.find((s) => s.filePath === selectedSessionPath) ?? null;

  if (projects.isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <pre className="max-w-2xl whitespace-pre-wrap rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] p-4 text-xs text-[var(--color-danger)]">
          {String(projects.error)}
        </pre>
      </div>
    );
  }

  return (
    <Group orientation="horizontal" {...layout}>
      <Panel defaultSize="28" minSize="20" className={panelCard}>
        <div className="flex h-full flex-col overflow-hidden">
          <CrossSessionSearch projectId={projectId}>
            {projects.isLoading ? (
              <p className="px-2 text-sm text-[var(--color-text-muted)]">Loading…</p>
            ) : (
              <ConversationsProjectSidebar
                projects={projects.data ?? []}
                selectedId={projectId}
                onSelect={setProjectId}
              />
            )}
          </CrossSessionSearch>
        </div>
      </Panel>

      <PanelSeparator />

      <Panel defaultSize="72" minSize="40" className={panelCard}>
        {selectedSessionPath ? (
          <SessionViewer
            key={selectedSessionPath}
            filePath={selectedSessionPath}
            sessionId={
              selectedSession
                ? sessionDisplayTitle(selectedSession)
                : (selectedSessionPath
                    .split(/[/\\]/)
                    .pop()
                    ?.replace(/\.jsonl$/, '') ?? 'session')
            }
            onBack={() => setSelectedSessionPath(null)}
          />
        ) : (
          <SessionTable
            sessions={sessions.data ?? []}
            isLoading={sessions.isLoading}
            selectedProjectName={selectedProject?.displayName ?? null}
          />
        )}
      </Panel>
    </Group>
  );
}
