import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, fieldInput } from '@/components/ui/Field';

interface Props {
  open: boolean;
  initialValue: string;
  fallbackTitle: string;
  busy?: boolean;
  onSubmit: (title: string | null) => void;
  onCancel: () => void;
}

export function RenameSessionDialog({
  open,
  initialValue,
  fallbackTitle,
  busy,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      const t = setTimeout(() => inputRef.current?.select(), 30);
      return () => clearTimeout(t);
    }
  }, [open, initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    onSubmit(trimmed.length > 0 ? trimmed : null);
  };

  return (
    <ConfirmDialog
      open={open}
      title="Rename conversation"
      description="Имя видно только в Echo Studio — исходный файл сессии не меняется."
      confirmLabel="Save"
      busy={busy}
      onConfirm={submit}
      onCancel={onCancel}
    >
      <Field label="Name" hint="Очистите поле и сохраните, чтобы вернуть исходное имя.">
        {(id) => (
          <input
            id={id}
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={fallbackTitle}
            className={fieldInput}
          />
        )}
      </Field>
    </ConfirmDialog>
  );
}
