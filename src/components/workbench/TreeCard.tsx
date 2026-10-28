import { ChevronDown, ChevronsDownUp, ChevronUp, Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { tooltip } from '@/components/ui/Tooltip';
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
  query: string;
  onQuery: (query: string) => void;
  children: ReactNode;
}

export function TreeCard({ open, onOpen, current, total, query, onQuery, children }: Props) {
  const anyOpen = useWorkbenchStore((s) => s.openGroups.length > 0);
  const collapseGroups = useWorkbenchStore((s) => s.collapseGroups);
  const row = useRef<HTMLButtonElement>(null);
  const head = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (
        document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open]')
      )
        return;
      if (e.key === 'Escape') {
        if (query) onQuery('');
        else onOpen(false);
        return;
      }
      const typing = e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;
      const t = e.target as HTMLElement | null;
      if (typing && !t?.closest('input, textarea, [contenteditable]')) head.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpen, query, onQuery]);

  useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    if (!open) onQuery('');
    (open ? head : row).current?.focus({ preventScroll: true });
  }, [open, onQuery]);

  const count = `${total} ${plural(total, 'проект', 'проекта', 'проектов')}`;
  return (
    <>
      {open && <div className="wb-tc-scrim" aria-hidden="true" onClick={() => onOpen(false)} />}
      <section ref={card} className={cn('wb-tc', open && 'open')} aria-label="Проекты">
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
            <label className="wb-tc-q">
              <Search strokeWidth={2} />
              <input
                ref={head}
                type="text"
                value={query}
                placeholder="Найти проект"
                aria-label="Найти проект"
                spellCheck={false}
                onChange={(e) => onQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  card.current
                    ?.querySelector<HTMLButtonElement>('.wb-tree .wb-tr:not(.grp)')
                    ?.click();
                }}
              />
            </label>
            {query && (
              <button
                type="button"
                className="wb-tc-tg"
                aria-label="Очистить поиск"
                {...tooltip('Очистить поиск', 'bottom')}
                onClick={() => {
                  onQuery('');
                  head.current?.focus();
                }}
              >
                <X strokeWidth={2} />
              </button>
            )}
            <button
              type="button"
              className="wb-tc-tg"
              {...tooltip('Свернуть все группы', 'bottom')}
              aria-label="Свернуть все группы"
              disabled={!anyOpen}
              onClick={collapseGroups}
            >
              <ChevronsDownUp strokeWidth={2} />
            </button>
            <button
              type="button"
              className="wb-tc-tg"
              {...tooltip('Скрыть дерево', 'bottom')}
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
