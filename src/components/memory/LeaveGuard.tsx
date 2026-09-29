import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useUiStore } from '@/state/ui-store';

export function LeaveGuard() {
  const guard = useUiStore((s) => s.memoryGuard);
  const setGuard = useUiStore((s) => s.setMemoryGuard);
  const setDirty = useUiStore((s) => s.setMemoryDirty);

  return (
    <ConfirmDialog
      open={guard !== null}
      title="Отменить правку?"
      description="В записи есть несохранённые изменения. Если продолжить, они пропадут."
      confirmLabel="Отменить правку"
      cancelLabel="Продолжить редактирование"
      danger
      onCancel={() => setGuard(null)}
      onConfirm={() => {
        setDirty(false);
        setGuard(null);
        guard?.();
      }}
    />
  );
}
