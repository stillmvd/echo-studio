import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

const EVENT_PROGRESS = 'echovault://reindex-progress';
const EVENT_DONE = 'echovault://reindex-done';
const EVENT_ERROR = 'echovault://reindex-error';

export interface ReindexState {
  running: boolean;
  lastLine: string | null;
  error: string | null;
  doneAt: number | null;
}

export function useReindex() {
  const qc = useQueryClient();
  const [state, setState] = useState<ReindexState>({
    running: false,
    lastLine: null,
    error: null,
    doneAt: null,
  });

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<string>(EVENT_PROGRESS, (e) => {
      setState((s) => ({ ...s, lastLine: e.payload, error: null }));
    }).then((fn) => unlisteners.push(fn));

    listen(EVENT_DONE, () => {
      setState({ running: false, lastLine: null, error: null, doneAt: Date.now() });
      qc.invalidateQueries({ queryKey: ['memories'] });
    }).then((fn) => unlisteners.push(fn));

    listen<string>(EVENT_ERROR, (e) => {
      setState({ running: false, lastLine: null, error: e.payload, doneAt: Date.now() });
    }).then((fn) => unlisteners.push(fn));

    return () => {
      for (const u of unlisteners) u();
    };
  }, [qc]);

  const start = async () => {
    setState({ running: true, lastLine: 'starting…', error: null, doneAt: null });
    try {
      await invoke('trigger_reindex');
    } catch (e) {
      setState({ running: false, lastLine: null, error: String(e), doneAt: Date.now() });
    }
  };

  return { ...state, start };
}
