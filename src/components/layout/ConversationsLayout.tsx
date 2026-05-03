import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ConversationsProjectSidebar } from '@/components/conversations/ConversationsProjectSidebar';
import { CrossSessionSearch } from '@/components/conversations/CrossSessionSearch';
import { SessionTable } from '@/components/conversations/SessionTable';
import { SessionViewer } from '@/components/conversations/SessionViewer';
import { useConversationProjects, useConversationSessions } from '@/hooks/use-conversations';
import { useUiStore } from '@/state/ui-store';

export function ConversationsLayout() {
  const projectId = useUiStore((s) => s.conversationsProjectId);
  const setProjectId = useUiStore((s) => s.setConversationsProjectId);
  const selectedSessionPath = useUiStore((s) => s.selectedSessionPath);
  const setSelectedSessionPath = useUiStore((s) => s.setSelectedSessionPath);

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
    <PanelGroup direction="horizontal" autoSaveId="echo-studio.conversations.panel-sizes">
      <Panel defaultSize={28} minSize={20} className="bg-[var(--color-bg-secondary)]">
        <div className="flex h-full flex-col overflow-hidden">
          <CrossSessionSearch projectId={projectId} />
          {projects.isLoading ? (
            <div className="p-4 text-sm text-[var(--color-text-muted)]">Loading…</div>
          ) : (
            <ConversationsProjectSidebar
              projects={projects.data ?? []}
              selectedId={projectId}
              onSelect={setProjectId}
            />
          )}
        </div>
      </Panel>

      <PanelResizeHandle className="w-px bg-[var(--color-border-subtle)] transition-colors hover:bg-[var(--color-accent)] data-[resize-handle-state=drag]:bg-[var(--color-accent)]" />

      <Panel defaultSize={72} minSize={40} className="bg-[var(--color-bg-primary)]">
        {selectedSessionPath ? (
          <SessionViewer
            filePath={selectedSessionPath}
            sessionId={
              selectedSession?.sessionId ??
              selectedSessionPath
                .split(/[/\\]/)
                .pop()
                ?.replace(/\.jsonl$/, '') ??
              'session'
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
    </PanelGroup>
  );
}
