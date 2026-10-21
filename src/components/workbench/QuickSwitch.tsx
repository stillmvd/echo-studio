import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { ClaudeSession, WorkbenchProject } from '@/lib/types';
import {
  assignTabs,
  CELL_COUNT,
  nextInRecency,
  recentSessions,
  STATUS_LABEL,
  statusTitle,
  statusView,
  wallPick,
} from '@/lib/workbench';
import { useRecentStore } from '@/state/recent-store';
import { layoutOf, useWorkbenchStore } from '@/state/workbench-store';
import { ProjectIcon } from './ProjectIcon';
import { openSession, sessionPlace } from './SessionStrip';
import { StatusIcon } from './StatusIcon';
import { focus as focusTerminal } from './terminals';

interface Props {
  enabled: boolean;
  sessions: ClaudeSession[];
  projects: Map<string, WorkbenchProject>;
}

interface Open {
  order: ClaudeSession[];
  pick: string | null;
}

export function QuickSwitch({ enabled, sessions, projects }: Props) {
  const seen = useWorkbenchStore((s) => s.seen);
  const [open, setOpen] = useState<Open | null>(null);
  const state = useRef({ open, sessions, seen });
  state.current = { open, sessions, seen };
  const list = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLElement | null>(null);
  const isOpen = open !== null;

  useEffect(() => {
    if (isOpen) list.current?.focus();
  }, [isOpen]);

  const cancel = () => {
    state.current.open = null;
    setOpen(null);
    if (back.current?.isConnected) {
      back.current.focus();
      return;
    }
    const s = useWorkbenchStore.getState();
    if (s.mode === 'project') {
      if (s.view.kind !== 'project') return;
      const layout = layoutOf(s, s.view.path);
      const key = layout.cells[layout.focus]?.active;
      if (key) focusTerminal(key);
      return;
    }
    const shown = s.cells.slice(0, CELL_COUNT[s.layout]);
    const activeOf = (path: string) => s.activeTab[path];
    const keys = assignTabs(
      shown,
      (path) => s.tabs[path] ?? [],
      activeOf,
      wallPick(state.current.sessions, state.current.seen, activeOf),
    );
    const key = keys[shown.findIndex((c) => c.id === s.focusCell)];
    if (key) focusTerminal(key);
  };
  const jump = (target: ClaudeSession) => {
    state.current.open = null;
    setOpen(null);
    openSession(target);
    requestAnimationFrame(() => focusTerminal(target.sessionId));
  };
  const actions = useRef({ cancel, jump });
  actions.current = { cancel, jump };

  useEffect(() => {
    if (!enabled) {
      setOpen(null);
      return;
    }
    const show = (next: Open | null) => {
      if (next && !state.current.open && document.activeElement instanceof HTMLElement) {
        back.current = document.activeElement;
      }
      state.current.open = next;
      setOpen(next);
    };
    const go = (pick: string | null, order: ClaudeSession[]) => {
      const target = order.find((s) => s.sessionId === pick);
      if (target) actions.current.jump(target);
      else actions.current.cancel();
    };
    const onDown = (e: KeyboardEvent) => {
      const cur = state.current;
      if (cur.open && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        actions.current.cancel();
        return;
      }
      if (!e.ctrlKey || e.code !== 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      if (cur.open) {
        const ids = cur.open.order.map((s) => s.sessionId);
        show({ ...cur.open, pick: nextInRecency(ids, cur.open.pick, e.shiftKey) });
        return;
      }
      const order = recentSessions(useRecentStore.getState().history, cur.sessions);
      if (order.length === 0) return;
      const ids = order.map((s) => s.sessionId);
      show({ order, pick: nextInRecency(ids, ids[0] ?? null, e.shiftKey) });
    };
    const onUp = (e: KeyboardEvent) => {
      const cur = state.current.open;
      if (cur && e.key === 'Control') go(cur.pick, cur.order);
    };
    const onBlur = () => show(null);
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled]);

  if (!open) return null;

  return (
    <>
      <div className="wb-scrim" onClick={cancel} aria-hidden />
      <div
        ref={list}
        className="wb-sw"
        role="listbox"
        aria-label="Сессии"
        tabIndex={-1}
        aria-activedescendant={open.pick ? `qs-${open.pick}` : undefined}
      >
        {open.order.map((s, i) => {
          const status = statusView(s, seen);
          const project = s.projectPath ? projects.get(s.projectPath) : undefined;
          return (
            <button
              key={s.sessionId}
              id={`qs-${s.sessionId}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={s.sessionId === open.pick}
              className={cn('wb-swr', s.sessionId === open.pick && 'on')}
              title={statusTitle(status)}
              onClick={() => jump(s)}
            >
              <ProjectIcon svg={project?.icon ?? null} />
              <span className="wb-tn">
                <b>{s.name || 'Claude'}</b>
                <span>{sessionPlace(s, projects)}</span>
              </span>
              <StatusIcon session={{ status, phase: s.phase, tool: s.tool }} />
              <span className="wb-dim">{i === 0 ? 'сейчас' : STATUS_LABEL[status]}</span>
            </button>
          );
        })}
        <div className="wb-swf">
          <span className="wb-kbd">Ctrl</span>
          <span className="wb-kbd">Tab</span> дальше · <span className="wb-kbd">Shift</span> назад ·
          отпусти — перейти
        </div>
      </div>
    </>
  );
}
