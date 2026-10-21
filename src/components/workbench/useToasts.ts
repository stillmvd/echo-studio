import { sendNotification } from '@tauri-apps/plugin-notification';
import { useEffect, useRef } from 'react';
import { useTauriEvent } from '@/hooks/use-workbench';
import { toastsMuted } from '@/lib/ipc';
import { type Marks, marksOf, pickToasts, rememberToast, takeActivation } from '@/lib/toasts';
import type { ClaudeSession, DevServer, WorkbenchProject } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { useWorkbenchStore } from '@/state/workbench-store';
import { isShown } from './terminals';

const muted = toastsMuted().catch(() => true);
const folder = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

export function useToasts(
  sessions: ClaudeSession[],
  devs: DevServer[],
  projects: Map<string, WorkbenchProject>,
) {
  const prev = useRef<Marks | null>(null);
  const last = useRef(new Map<string, number>());

  useEffect(() => {
    const before = prev.current;
    prev.current = marksOf(sessions, devs);
    if (!before) return;
    const toasts = pickToasts({
      prev: before,
      sessions,
      devs,
      name: (path) => projects.get(path)?.name ?? folder(path),
      unseen: (tab) => !document.hasFocus() || !isShown(tab),
      last: last.current,
      now: Date.now(),
    });
    if (toasts.length === 0) return;
    void muted.then((off) => {
      if (off) return;
      for (const t of toasts) {
        rememberToast(t);
        sendNotification({ title: t.title, body: t.body });
      }
    });
  }, [sessions, devs, projects]);

  useTauriEvent('echo://activated', () => {
    const target = takeActivation(Date.now());
    if (!target) return;
    useUiStore.getState().setActiveTab('workbench');
    const wb = useWorkbenchStore.getState();
    wb.openTab(target.path, target.tab);
    wb.select({ kind: 'project', path: target.path });
  });
}
