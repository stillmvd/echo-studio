import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, fieldInput } from '@/components/ui/Field';
import { useRenameSession } from '@/hooks/use-session-actions';
import { type SessionMeta, sessionDisplayTitle } from '@/lib/types';

interface Props {
  session: SessionMeta | null;
  onClose: () => void;
}

function currentName(s: SessionMeta): string {
  return s.userTitle?.trim() || s.customTitle?.trim() || s.aiTitle?.trim() || '';
}

export function RenameSessionDialog({ session, onClose }: Props) {
  const rename = useRenameSession();
  const initialValue = session ? currentName(session) : '';
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session) {
      setValue(initialValue);
      const t = setTimeout(() => inputRef.current?.select(), 30);
      return () => clearTimeout(t);
    }
  }, [session, initialValue]);

  const trimmed = value.trim();

  return (
    <ConfirmDialog
      open={!!session}
      title="Переименовать"
      description="Имя запишется в сессию, как /rename в Claude, — его покажут и Echo Studio, и claude --resume."
      confirmLabel="Сохранить"
      busy={rename.isPending}
      confirmDisabled={trimmed.length === 0 || trimmed === initialValue}
      onConfirm={async () => {
        if (!session) return;
        await rename.mutateAsync({ filePath: session.filePath, title: trimmed });
        onClose();
      }}
      onCancel={onClose}
    >
      <Field label="Имя">
        {(id) => (
          <input
            id={id}
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={session ? sessionDisplayTitle(session) : ''}
            className={fieldInput}
          />
        )}
      </Field>
    </ConfirmDialog>
  );
}
