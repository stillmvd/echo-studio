import { useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

const EVENT_DB_CHANGED = 'echovault://changed';

export function useDbWatcher() {
  const qc = useQueryClient();
  const [lastChange, setLastChange] = useState<number>(0);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen(EVENT_DB_CHANGED, () => {
      setLastChange(Date.now());
      qc.invalidateQueries({ queryKey: ['memories'] });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [qc]);

  return { lastChange };
}
