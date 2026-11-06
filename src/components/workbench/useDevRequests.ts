import { useEffect } from 'react';
import { useTauriEvent } from '@/hooks/use-workbench';
import { type DevRequest, takeDevRequests } from '@/lib/ipc';
import { samePath } from '@/lib/workbench';
import { toast } from '@/state/toast-store';
import { goToTab, useUiStore } from '@/state/ui-store';
import { useWorkbenchStore } from '@/state/workbench-store';
import { placeDevLog } from './DevCapsule';

const folder = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

function busyElsewhere(path: string) {
  if (!document.hasFocus()) return false;
  if (useUiStore.getState().activeTab !== 'workbench') return true;
  const view = useWorkbenchStore.getState().view;
  return view.kind === 'project' && !samePath(view.path, path);
}

function apply(request: DevRequest) {
  const name = folder(request.projectPath);
  if (request.error) {
    toast(`dev проекта ${name} не запустился: ${request.error}`, 'fail');
    return;
  }
  placeDevLog(request.projectPath);
  if (busyElsewhere(request.projectPath)) {
    toast(`dev проекта ${name} запущен`);
    return;
  }
  if (!useUiStore.getState().memoryDirty) goToTab('workbench');
  useWorkbenchStore.getState().select({ kind: 'project', path: request.projectPath });
}

function drain() {
  void takeDevRequests()
    .then((list) => {
      for (const r of list) apply(r);
    })
    .catch(() => {});
}

export function useDevRequests() {
  useEffect(drain, []);
  useTauriEvent('workbench://dev-request', drain);
}
