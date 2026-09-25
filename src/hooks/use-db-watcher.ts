import { useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

const EVENT_DB_CHANGED = 'echovault://changed';

export function useDbWatcher() {
  const qc = useQueryClient();
  const [lastChange, setLastChange] = useState<number>(0);

  useEffect(() => {
    const pending = listen(EVENT_DB_CHANGED, () => {
      setLastChange(Date.now());
      qc.invalidateQueries({ queryKey: ['memories'] });
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, [qc]);

  return { lastChange };
}
