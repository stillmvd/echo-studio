import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { plural } from '@/lib/dashboard';
import { quitStoppingKimi } from '@/lib/ipc';

export function CloseGuard() {
  const [live, setLive] = useState(0);

  useEffect(() => {
    const off = listen<number>('echo://confirm-close', (e) => setLive(e.payload));
    return () => {
      off.then((f) => f()).catch(() => {});
    };
  }, []);

  return (
    <ConfirmDialog
      open={live > 0}
      title="Закрыть Echo?"
      description={`${live} ${plural(live, 'сессия', 'сессии', 'сессий')} Kimi ${plural(live, 'работает', 'работают', 'работают')} внутри Echo и ${plural(live, 'остановится', 'остановятся', 'остановятся')}. Начатые разговоры можно будет продолжить из списка проекта.`}
      confirmLabel="Закрыть и остановить"
      cancelLabel="Отмена"
      danger
      onConfirm={() => quitStoppingKimi()}
      onCancel={() => setLive(0)}
    />
  );
}
