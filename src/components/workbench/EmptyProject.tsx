import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, MessageSquare, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useOpenMenu } from '@/components/ui/ContextMenu';
import { useConversationProjects, useConversationSessions } from '@/hooks/use-conversations';
import { useDeleteSession } from '@/hooks/use-session-actions';
import { listClaudeSessions } from '@/lib/ipc';
import { sessionSubject } from '@/lib/sessions';
import type { DevServer, SessionMeta, WorkbenchProject } from '@/lib/types';
import { sessionDisplayTitle } from '@/lib/types';
import { samePath, shortPath } from '@/lib/workbench';
import { DevCapsule } from './DevCapsule';
import { conversationMenu } from './menus';
import { ProjectIcon } from './ProjectIcon';

const ROW = 42;
const SKELETON = [0, 1, 2, 3];

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
  const { data, isPending } = useConversationSessions(visible ? convId : null);
  const pending = !convProjects || (convId !== null && isPending);
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
  const openMenu = useOpenMenu();
  const del = useDeleteSession();
  const [removing, setRemoving] = useState<SessionMeta | null>(null);
  const live = useQuery({
    queryKey: ['workbench', 'sessions'],
    queryFn: listClaudeSessions,
    enabled: false,
  }).data;
  const isLive = (id: string) => !!live?.some((s) => s.sessionId === id && s.status !== 'exited');

  return (
    <div className="wb-area">
      <div className="wb-empty">
        <div className="wb-eh">
          <ProjectIcon svg={project.icon} size="hero" />
          <div className="wb-et">
            <b title={project.name}>{project.name}</b>
            <span className="wb-path" title={project.path}>
              {shortPath(project.path)}
            </span>
          </div>
          <div className="wb-eb">
            <button type="button" className="wb-btn p" disabled={busy} onClick={() => onStart()}>
              <Plus strokeWidth={2} />
              Новая сессия Claude
            </button>
            <DevCapsule project={project} server={server} />
          </div>
        </div>
        {pending && (
          <div className="wb-res" aria-busy="true">
            <span className="wb-lbl">Продолжить</span>
            <div className="wb-res-list">
              {SKELETON.map((k) => (
                <span key={k} className="wb-rr sk">
                  <i />
                  <i />
                </span>
              ))}
            </div>
          </div>
        )}
        {!pending && sessions.length > 0 && (
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
                      onContextMenu={(e) =>
                        openMenu(
                          e,
                          conversationMenu({
                            live: isLive(s.sessionId),
                            busy,
                            actions: {
                              resume: () => onStart(s.sessionId),
                              remove: () => setRemoving(s),
                            },
                          }),
                        )
                      }
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
      <ConfirmDialog
        open={!!removing}
        danger
        title="Удалить сессию?"
        description="Файл .jsonl удалится с диска, вернуть его из Echo нельзя."
        subject={removing ? sessionSubject(removing) : null}
        confirmLabel="Удалить"
        doneToast="Сессия удалена"
        failToast="Сессия не удалилась"
        busy={del.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await del.mutateAsync(removing.filePath);
          setRemoving(null);
        }}
      />
    </div>
  );
}
