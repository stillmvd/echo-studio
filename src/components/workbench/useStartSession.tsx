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
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const start = useCallback(
    async (projectPath: string, resumeSessionId?: string): Promise<string | null> => {
      setBusy(true);
      try {
        const r = await startClaudeSession(projectPath, resumeSessionId);
        if (r.sessionId) {
          rememberShort(r.sessionId, r.shortId, true);
          openTab(projectPath, r.sessionId);
        } else {
          setNotice({
            title: 'Сессия запущена',
            text: `Сессия ${r.shortId} работает, но Claude ещё не отдал её в список. Она появится в «Запущено» — откройте её оттуда, новую не запускайте.`,
          });
        }
        select({ kind: 'project', path: projectPath });
        void qc.invalidateQueries({ queryKey: ['workbench', 'sessions'] });
        return r.sessionId;
      } catch (e) {
        if (String(e) === 'untrusted') setUntrusted(projectPath);
        else setNotice({ title: 'Сессия не запустилась', text: String(e) });
        return null;
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
        open={notice !== null}
        title={notice?.title ?? ''}
        description={notice?.text ?? ''}
        confirmLabel="Понятно"
        cancelLabel="Закрыть"
        onConfirm={() => setNotice(null)}
        onCancel={() => setNotice(null)}
      />
    </>
  );

  return { start, busy, dialogs };
}
