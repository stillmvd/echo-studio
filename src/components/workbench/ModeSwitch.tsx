import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { useWorkbenchStore, type WorkbenchMode } from '@/state/workbench-store';

const MODES: { key: WorkbenchMode; label: string; hint: string }[] = [
  { key: 'project', label: 'Проект', hint: 'Раскладка каждого проекта своя' },
  { key: 'wall', label: 'Пульт', hint: 'Все проекты на одном экране, ячейки занимают ждущие' },
];

let refocus = false;

export function ModeSwitch() {
  const mode = useWorkbenchStore((s) => s.mode);
  const setMode = useWorkbenchStore((s) => s.setMode);
  const ref = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    if (!refocus) return;
    refocus = false;
    ref.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, []);

  const change = (key: WorkbenchMode) => {
    refocus = true;
    setMode(key);
    requestAnimationFrame(() => {
      refocus = false;
    });
  };

  return (
    <fieldset ref={ref} className="wl-seg txt" aria-label="Режим рабочего места">
      {MODES.map(({ key, label, hint }) => (
        <label key={key} title={hint} className={cn(key === mode && 'on')}>
          <input
            type="radio"
            name="wb-mode"
            className="sr-only"
            checked={key === mode}
            onChange={() => change(key)}
          />
          <span className="wl-seg-t" data-t={label}>
            {label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
