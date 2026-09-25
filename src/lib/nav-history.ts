import { useUiStore } from '@/state/ui-store';

type UiState = ReturnType<typeof useUiStore.getState>;

interface NavSnapshot {
  activeTab: UiState['activeTab'];
  conversationsProjectId: string | null;
  selectedSessionPath: string | null;
  selectedMemoryId: string | null;
}

const LIMIT = 50;

function snapshot(s: UiState): NavSnapshot {
  return {
    activeTab: s.activeTab,
    conversationsProjectId: s.conversationsProjectId,
    selectedSessionPath: s.selectedSessionPath,
    selectedMemoryId: s.selectedMemoryId,
  };
}

function same(a: NavSnapshot, b: NavSnapshot): boolean {
  return (
    a.activeTab === b.activeTab &&
    a.conversationsProjectId === b.conversationsProjectId &&
    a.selectedSessionPath === b.selectedSessionPath &&
    a.selectedMemoryId === b.selectedMemoryId
  );
}

export function createNavHistory(store: typeof useUiStore) {
  const past: NavSnapshot[] = [];
  const future: NavSnapshot[] = [];
  let current = snapshot(store.getState());
  let restoring = false;

  const unsubscribe = store.subscribe((state) => {
    const next = snapshot(state);
    if (same(next, current)) return;
    if (!restoring) {
      past.push(current);
      if (past.length > LIMIT) past.shift();
      future.length = 0;
    }
    current = next;
  });

  const restore = (target: NavSnapshot) => {
    restoring = true;
    const projectChanged = target.conversationsProjectId !== current.conversationsProjectId;
    store.setState({
      ...target,
      pendingMemoryAction: null,
      ...(projectChanged ? { conversationsBulkSelection: [] } : {}),
    });
    restoring = false;
  };

  const back = () => {
    const target = past.pop();
    if (!target) return false;
    future.push(current);
    restore(target);
    return true;
  };

  const forward = () => {
    const target = future.pop();
    if (!target) return false;
    past.push(current);
    restore(target);
    return true;
  };

  return { back, forward, unsubscribe };
}

export function installMouseNavigation(): () => void {
  const history = createNavHistory(useUiStore);
  const onMouseUp = (e: MouseEvent) => {
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault();
    if (e.button === 3) history.back();
    else history.forward();
  };
  const block = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) e.preventDefault();
  };
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousedown', block);
  window.addEventListener('auxclick', block);
  return () => {
    history.unsubscribe();
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mousedown', block);
    window.removeEventListener('auxclick', block);
  };
}
