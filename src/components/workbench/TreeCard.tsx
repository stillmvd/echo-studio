import { ChevronDown, ChevronsDownUp, ChevronUp } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/memory';
import type { WorkbenchProject } from '@/lib/types';
import { useWorkbenchStore } from '@/state/workbench-store';
import { ProjectIcon } from './ProjectIcon';

interface Props {
  open: boolean;
  onOpen: (open: boolean) => void;
  current: WorkbenchProject | undefined;
  total: number;
  children: ReactNode;
}

export function TreeCard({ open, onOpen, current, total, children }: Props) {
  const anyOpen = useWorkbenchStore((s) => s.openGroups.length > 0);
  const collapseGroups = useWorkbenchStore((s) => s.collapseGroups);
  const row = useRef<HTMLButtonElement>(null);
  const head = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      onOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpen]);

  useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    (open ? head : row).current?.focus({ preventScroll: true });
  }, [open]);

  const count = `${total} ${plural(total, 'проект', 'проекта', 'проектов')}`;
  return (
    <>
      {open && <div className="wb-tc-scrim" aria-hidden="true" onClick={() => onOpen(false)} />}
      <section className={cn('wb-tc', open && 'open')} aria-label="Проекты">
        <button
          ref={row}
          type="button"
          className="wb-tc-row"
          aria-expanded={false}
          inert={open}
          onClick={() => onOpen(true)}
        >
          {current ? (
            <>
              <ProjectIcon svg={current.icon} />
              <b>{current.name}</b>
              <span className="wb-dim">· {count}</span>
            </>
          ) : (
            <>
              <b>Проекты</b>
              <span className="wb-dim">{total}</span>
            </>
          )}
          <span className="wb-gap" />
          <span className="wb-tc-tg">
            <ChevronUp strokeWidth={2} />
          </span>
        </button>
        <div className="wb-tc-in" inert={!open}>
          <div className="wb-tc-h">
            <button
              ref={head}
              type="button"
              className="wb-tc-hb"
              aria-expanded={true}
              onClick={() => onOpen(false)}
            >
              Проекты
              <span className="wb-gap" />
            </button>
            <button
              type="button"
              className="wb-tc-tg"
              title="Свернуть все группы"
              aria-label="Свернуть все группы"
              disabled={!anyOpen}
              onClick={collapseGroups}
            >
              <ChevronsDownUp strokeWidth={2} />
            </button>
            <button
              type="button"
              className="wb-tc-tg"
              title="Скрыть дерево"
              aria-label="Скрыть дерево"
              onClick={() => onOpen(false)}
            >
              <ChevronDown strokeWidth={2} />
            </button>
          </div>
          {children}
        </div>
      </section>
    </>
  );
}
