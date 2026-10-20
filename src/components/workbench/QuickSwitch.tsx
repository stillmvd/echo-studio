import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { ClaudeSession, WorkbenchProject } from '@/lib/types';
import { byRecency, effectiveStatus, nextInRecency, STATUS_LABEL } from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { ProjectIcon } from './ProjectIcon';
import { openSession, sessionPlace } from './SessionStrip';
import { StatusIcon } from './StatusIcon';

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

  useEffect(() => {
    if (!enabled) {
      setOpen(null);
      return;
    }
    const show = (next: Open | null) => {
      state.current.open = next;
      setOpen(next);
    };
    const go = (pick: string | null, order: ClaudeSession[]) => {
      show(null);
      const target = order.find((s) => s.sessionId === pick);
      if (target) openSession(target);
    };
    const onDown = (e: KeyboardEvent) => {
      const cur = state.current;
      if (cur.open && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        show(null);
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
      const order = byRecency(cur.sessions, useWorkbenchStore.getState().recency, cur.seen);
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
      <div className="wb-scrim" onClick={() => setOpen(null)} aria-hidden />
      <div className="wb-sw" role="listbox" aria-label="Сессии">
        {open.order.map((s, i) => {
          const status = effectiveStatus(s, seen);
          const project = s.projectPath ? projects.get(s.projectPath) : undefined;
          return (
            <button
              key={s.sessionId}
              type="button"
              role="option"
              aria-selected={s.sessionId === open.pick}
              className={cn('wb-swr', s.sessionId === open.pick && 'on')}
              onClick={() => {
                setOpen(null);
                openSession(s);
              }}
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
