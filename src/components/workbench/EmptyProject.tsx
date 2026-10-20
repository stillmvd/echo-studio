import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, MessageSquare, Plus } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { useConversationProjects, useConversationSessions } from '@/hooks/use-conversations';
import type { DevServer, SessionMeta, WorkbenchProject } from '@/lib/types';
import { sessionDisplayTitle } from '@/lib/types';
import { samePath } from '@/lib/workbench';
import { DevCapsule } from './DevCapsule';
import { ProjectIcon } from './ProjectIcon';

const ROW = 46;

const DAY_MS = 86_400_000;

function when(iso: string | null, now: Date): string {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / DAY_MS,
  );
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `сегодня, ${time}`;
  if (days === 1) return `вчера, ${time}`;
  return d
    .toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    })
    .replace('.', '');
}

const title = (s: SessionMeta) =>
  sessionDisplayTitle({ ...s, firstPrompt: s.firstReply?.trim() || s.firstPrompt });

interface Props {
  project: WorkbenchProject;
  server: DevServer | undefined;
  visible: boolean;
  busy: boolean;
  onStart: (resumeSessionId?: string) => void;
}

export function EmptyProject({ project, server, visible, busy, onStart }: Props) {
  const { data: convProjects } = useConversationProjects();
  const slug = project.path.replace(/[^A-Za-z0-9]/g, '-');
  const matches = convProjects?.filter((p) => samePath(p.cwd, project.path)) ?? [];
  const convId = (matches.find((p) => p.id === slug) ?? matches[0])?.id ?? null;
  const { data } = useConversationSessions(visible ? convId : null);
  const sessions = useMemo(
    () =>
      [...(data ?? [])].sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? '')),
    [data],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (i) => sessions[i]?.sessionId ?? i,
    estimateSize: () => ROW,
  });
  const now = new Date();

  return (
    <div className="wb-area">
      <div className="wb-empty">
        <ProjectIcon svg={project.icon} size="xl" />
        <div className="wb-eb">
          <button type="button" className="wb-btn p lg" disabled={busy} onClick={() => onStart()}>
            <Plus strokeWidth={2} />
            Новая сессия Claude
          </button>
          <DevCapsule project={project} server={server} large />
        </div>
        {sessions.length > 0 && (
          <div className="wb-res">
            <span className="wb-lbl">Продолжить</span>
            <div ref={scrollRef} className="wb-res-list">
              <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                {virtualizer.getVirtualItems().map((v) => {
                  const s = sessions[v.index];
                  if (!s) return null;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      className="wb-rr absolute left-0 top-0"
                      style={{ transform: `translateY(${v.start}px)` }}
                      disabled={busy}
                      title={title(s)}
                      onClick={() => onStart(s.sessionId)}
                    >
                      <MessageSquare strokeWidth={2} />
                      <b>{title(s)}</b>
                      <span className="wb-dim">{when(s.lastEventAt, now)}</span>
                      <ChevronRight strokeWidth={2} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
