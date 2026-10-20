import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { openInClaudeCode, startClaudeSession } from '@/lib/ipc';
import { useWorkbenchStore } from '@/state/workbench-store';
import { rememberShort } from './terminals';

export function useStartSession() {
  const qc = useQueryClient();
  const openTab = useWorkbenchStore((s) => s.openTab);
  const select = useWorkbenchStore((s) => s.select);
  const [untrusted, setUntrusted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = useCallback(
    async (projectPath: string, resumeSessionId?: string) => {
      setBusy(true);
      try {
        const r = await startClaudeSession(projectPath, resumeSessionId);
        rememberShort(r.sessionId, r.shortId, true);
        openTab(projectPath, r.sessionId);
        select({ kind: 'project', path: projectPath });
        void qc.invalidateQueries({ queryKey: ['workbench', 'sessions'] });
      } catch (e) {
        if (String(e) === 'untrusted') setUntrusted(projectPath);
        else setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [openTab, select, qc],
  );

  const dialogs = (
    <>
      <ConfirmDialog
        open={untrusted !== null}
        title="Папка не доверена"
        description="Claude Code запускает фоновые сессии только в папках, которым уже доверяли. Откройте Claude в этой папке один раз и подтвердите доверие — потом сессии пойдут отсюда."
        confirmLabel="Открыть в Claude"
        cancelLabel="Закрыть"
        onConfirm={async () => {
          if (untrusted) await openInClaudeCode(untrusted);
          setUntrusted(null);
        }}
        onCancel={() => setUntrusted(null)}
      />
      <ConfirmDialog
        open={error !== null}
        title="Сессия не запустилась"
        description={error ?? ''}
        confirmLabel="Понятно"
        cancelLabel="Закрыть"
        onConfirm={() => setError(null)}
        onCancel={() => setError(null)}
      />
    </>
  );

  return { start, busy, dialogs };
}
