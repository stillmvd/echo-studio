import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import type { ClaudeSession, WorkbenchProject } from '@/lib/types';
import {
  arrangeCells,
  byUrgency,
  CELL_COUNT,
  effectiveStatus,
  STATUS_LABEL,
  samePath,
} from '@/lib/workbench';
import { useWorkbenchStore } from '@/state/workbench-store';
import { StatusIcon } from './StatusIcon';

interface Props {
  sessions: ClaudeSession[];
  projects: Map<string, WorkbenchProject>;
  wall: boolean;
}

export function openSession(s: ClaudeSession) {
  if (!s.projectPath) return;
  const { openTab, select } = useWorkbenchStore.getState();
  if (s.kind === 'shell') openTab(s.projectPath, s.sessionId);
  select({ kind: 'project', path: s.projectPath });
}

export function sessionPlace(s: ClaudeSession, projects: Map<string, WorkbenchProject>): string {
  const project = s.projectPath ? projects.get(s.projectPath) : undefined;
  return project?.name ?? s.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? 'без папки';
}

export function SessionStrip({ sessions, projects, wall }: Props) {
  const seen = useWorkbenchStore((s) => s.seen);
  const view = useWorkbenchStore((s) => s.view);
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const layout = useWorkbenchStore((s) => s.layout);
  const cells = useWorkbenchStore((s) => s.cells);
  const focusCell = useWorkbenchStore((s) => s.focusCell);
  const bar = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const clear = () => {
      const pill = document.querySelector<HTMLElement>('[role="status"]');
      const margin = Number.parseFloat(el.style.marginRight) || 0;
      if (!pill) {
        el.style.marginRight = '';
        return;
      }
      const a = el.getBoundingClientRect();
      const b = pill.getBoundingClientRect();
      const overlaps = b.top < a.bottom && b.bottom > a.top;
      el.style.marginRight = `${overlaps ? Math.max(0, a.right + margin - b.left + 8) : 0}px`;
    };
    clear();
    const ro = new ResizeObserver(clear);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, []);

  const shown = cells.slice(0, CELL_COUNT[layout]);
  const inGrid = (s: ClaudeSession) =>
    !wall ||
    shown.some((c) => c.projectPath && s.projectPath && samePath(c.projectPath, s.projectPath));
  const pending = wall
    ? arrangeCells(shown, sessions, Date.now(), focusCell, seen).pendingCount
    : 0;
  const sorted = byUrgency(sessions, seen);
  const ins = sorted.filter(inGrid);
  const outs = sorted.filter((s) => !inGrid(s));

  const chip = (s: ClaudeSession, out: boolean) => {
    const status = effectiveStatus(s, seen);
    const on =
      view.kind === 'project' &&
      view.path === s.projectPath &&
      activeTab[s.projectPath ?? ''] === s.sessionId;
    return (
      <button
        key={s.sessionId}
        type="button"
        className={cn('wb-bp', out && 'out', on && 'on')}
        title={`${s.name || 'Claude'} · ${STATUS_LABEL[status]}`}
        onClick={() => openSession(s)}
      >
        <StatusIcon small session={{ status, phase: s.phase, tool: s.tool }} />
        <b>{sessionPlace(s, projects)}</b>
        <span className="wb-dim">{s.name || 'Claude'}</span>
      </button>
    );
  };

  return (
    <div ref={bar} className="wb-bar2" role="toolbar" aria-label="Сессии">
      <div
        className="wb-bar-list"
        onWheel={(e) => {
          if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        {sessions.length === 0 && <span className="wb-bar-lbl">Сессий нет</span>}
        {ins.map((s) => chip(s, false))}
        {outs.length > 0 && <span className="wl-sep">Вне сетки</span>}
        {outs.map((s) => chip(s, true))}
      </div>
      {pending > 0 && <span className="wb-bar-note">ещё ждут: {pending}</span>}
      <span className="wb-kbd">Ctrl</span>
      <span className="wb-kbd">Tab</span>
    </div>
  );
}
