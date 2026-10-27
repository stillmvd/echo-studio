import { ChevronRight, Ghost } from 'lucide-react';
import { type CSSProperties, type ReactNode, useRef, useState } from 'react';
import {
  type DashboardSection,
  Orphans,
  openDashboard,
  SessionStatus,
  sessionTitle,
} from '@/components/dashboard/DashboardLayout';
import { LimitBar, limitView, Ring, Spark } from '@/components/dashboard/parts';
import { cursorCard } from '@/components/ui/CursorCard';
import { useLoad, useLoadHistory, useRateLimits, useUsage } from '@/hooks/use-workbench-overview';
import { cn } from '@/lib/cn';
import {
  cacheShare,
  FIVE_HOURS,
  hourLabels,
  type ProjectToday,
  pct,
  plural,
  resetAt,
  sessionLoads,
  todayProjects,
  todayWeekShare,
  tok,
  tone,
  WEEK,
} from '@/lib/dashboard';
import { mb, nameOf, orphans } from '@/lib/overview';
import type { ClaudeSession, WorkbenchProject } from '@/lib/types';
import { goToTab } from '@/state/ui-store';
import { useWorkbenchStore } from '@/state/workbench-store';
import { useProcessKiller } from './Processes';
import { openSession } from './SessionStrip';

type Group = 'lim' | 'tok' | 'load' | 'ses' | 'orph';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const OPEN_DELAY = 200;
const DOTS = Array.from({ length: 10 }, (_, i) => i);

const SECTION: Record<Group, DashboardSection> = {
  lim: 'lim',
  tok: 'tok',
  load: 'mach',
  ses: 'ses',
  orph: 'mach',
};

const TITLE: Record<Group, string> = {
  lim: 'Лимиты',
  tok: 'Токены',
  load: 'Машина',
  ses: 'Сессии Claude',
  orph: 'Сироты',
};

interface Props {
  sessions: ClaudeSession[];
  projects: Map<string, WorkbenchProject>;
}

export function MetricsBar({ sessions, projects }: Props) {
  const limits = useRateLimits().data ?? null;
  const report = useUsage().data;
  const load = useLoad().data;
  const history = useLoadHistory();
  const killer = useProcessKiller();
  const [hov, setHov] = useState<Group | null>(null);
  const leave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (g: Group, delay = 0) => {
    if (leave.current) clearTimeout(leave.current);
    if (delay && hov === null) leave.current = setTimeout(() => setHov(g), delay);
    else setHov(g);
  };
  const hide = () => {
    if (leave.current) clearTimeout(leave.current);
    leave.current = setTimeout(() => setHov(null), 150);
  };

  const five = limitView(limits?.fiveHour ?? null, FIVE_HOURS);
  const week = limitView(limits?.sevenDay ?? null, WEEK);
  const s = report?.summary;
  const rows = load?.rows ?? [];
  const loads = sessionLoads(rows);
  const hanging = orphans(rows);
  const m = load?.machine;
  const memP = m?.memoryTotal ? (m.memoryUsed / m.memoryTotal) * 100 : 0;

  const hover = (g: Group) => ({
    onMouseEnter: () => show(g, OPEN_DELAY),
    onMouseLeave: hide,
    onFocus: () => show(g),
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.closest('.db-bp')?.contains(e.relatedTarget)) hide();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') setHov(null);
    },
  });

  const pill = (g: Group, face: ReactNode, pop: ReactNode, extra?: string) => (
    <div key={g} className={cn('db-bp', extra, hov === g && 'hov')}>
      <button
        type="button"
        className="db-bpb"
        aria-expanded={hov === g}
        onClick={() => openDashboard(SECTION[g])}
        {...hover(g)}
      >
        {face}
      </button>
      {hov === g && (
        <dialog open className="db-pop" aria-label={TITLE[g]} {...hover(g)}>
          <div className="db-sh">
            <b>{TITLE[g]}</b>
            <button type="button" className="db-go" onClick={() => openDashboard(SECTION[g])}>
              Дашборд
              <ChevronRight />
            </button>
          </div>
          {pop}
        </dialog>
      )}
    </div>
  );

  const maxHour = Math.max(1, ...(s?.hours ?? []));
  const nowHour = new Date().getHours();
  const hours = s?.hours ?? [];
  const day = [...hours.slice(nowHour + 1), ...hours.slice(0, nowHour + 1)];
  const slots = HOURS.map((i) => {
    const h = (nowHour + 1 + i) % 24;
    return { h, v: hours[h] ?? 0, yesterday: h > nowHour };
  });
  const weekToday = s ? todayWeekShare(s, limits?.sevenDay ?? null) : null;
  const top = todayProjects(report?.projects);
  const openProject = (path: string) => {
    setHov(null);
    useWorkbenchStore.getState().select({ kind: 'project', path });
    goToTab('workbench');
  };

  return (
    <div className="wb-foot">
      <div className="db-bar" role="toolbar" aria-label="Метрики">
        {pill(
          'lim',
          <>
            <Ring value={five.used ?? 0} size={18} stroke={3} />
            <Ring value={week.used ?? 0} size={18} stroke={3} />
            <span className="db-bl">5 ч</span>
            <b className={`t-${five.t}`}>{five.used === null ? '—' : `${five.used}%`}</b>
            <span className="db-bl">нед</span>
            <b className={`t-${week.t}`}>{week.used === null ? '—' : `${week.used}%`}</b>
          </>,
          <div className="db-lms one">
            <LimitBar label="5 часов" limit={limits?.fiveHour ?? null} window={FIVE_HOURS} />
            <LimitBar label="Неделя" limit={limits?.sevenDay ?? null} window={WEEK} />
          </div>,
        )}
        {pill(
          'tok',
          <>
            <Spark values={day} w={44} h={16} t="ok" />
            <b>{s ? tok(s.today) : '—'}</b>
            <span className="db-bl">сегодня</span>
          </>,
          s && (
            <>
              {weekToday === null ? (
                <div className="db-tks">
                  <b>{tok(s.today)}</b> сегодня
                </div>
              ) : (
                <>
                  <div className="db-tks">
                    <b>≈{pct(weekToday)}</b> недели за сегодня
                    <span className="wb-dim">· {tok(s.today)} токенов</span>
                  </div>
                  <span className="db-tksub wb-dim">
                    Неделя {week.used}%, {resetAt(limits?.sevenDay ?? null)}
                  </span>
                </>
              )}
              <div className="db-tps">
                {top.map((p) => (
                  <TokenProject
                    key={p.path}
                    p={p}
                    weekToday={weekToday}
                    project={projects.get(p.path)}
                    onOpen={() => openProject(p.path)}
                  />
                ))}
                {top.length === 0 && <span className="wb-dim">Сегодня ещё ничего</span>}
              </div>
              <div className="db-hours">
                {slots.map(({ h, v, yesterday }) => (
                  <i
                    key={h}
                    className={cn(yesterday && 'y', h === nowHour && 'now')}
                    style={{ height: `${Math.max(2, (v / maxHour) * 100)}%` }}
                    title={`${h}:00 · ${tok(v)}`}
                  />
                ))}
              </div>
              <div className="db-hax">
                {hourLabels(nowHour).map(([i, h]) => (
                  <span key={h} style={{ '--h': i } as CSSProperties}>
                    {h}
                  </span>
                ))}
                <span className="now">сейчас</span>
              </div>
            </>
          ),
        )}
        {pill(
          'load',
          <>
            <Ring value={m?.cpu ?? 0} size={18} stroke={3} />
            <Ring value={memP} size={18} stroke={3} />
            <span className="db-bl">CPU</span>
            <b className={`t-${tone(m?.cpu ?? 0)}`}>{m ? pct(m.cpu) : '—'}</b>
            <span className="db-bl">RAM</span>
            <b className={`t-${tone(memP)}`}>{m ? `${Math.round(memP)}%` : '—'}</b>
          </>,
          m && (
            <>
              <span className="db-mm">
                <b>CPU</b>
                <Spark values={history.machine} w={160} h={22} floor={100} t={tone(m.cpu)} />
                <span className={cn('db-num', `t-${tone(m.cpu)}`)}>{pct(m.cpu)}</span>
              </span>
              <span className="db-mm">
                <b>Память</b>
                <span className="db-mbar">
                  <i className={`t-${tone(memP)}`} style={{ width: `${memP}%` }} />
                </span>
                <span className={cn('db-num', `t-${tone(memP)}`)}>{Math.round(memP)}%</span>
              </span>
              <span className="db-ol">Не Claude</span>
              {m.others.slice(0, 4).map((o) => (
                <span key={o.name} className="db-or">
                  <b>{o.name.replace(/\.exe$/i, '')}</b>
                  <span className="wb-dim">{o.count > 1 ? `×${o.count}` : ''}</span>
                  <span className="db-num">{mb(o.memory)}</span>
                  <span className="db-num wb-dim">{pct(o.cpu)}</span>
                </span>
              ))}
            </>
          ),
        )}
        {pill(
          'ses',
          <>
            <span className="db-bdots">
              {loads.slice(0, 3).map((l) => (
                <SessionStatus
                  key={l.sessionId}
                  session={sessions.find((x) => x.sessionId === l.sessionId)}
                />
              ))}
            </span>
            <b>{loads.length}</b>
            <span className="db-bl">{plural(loads.length, 'сессия', 'сессии', 'сессий')}</span>
            <b>{mb(loads.reduce((a, l) => a + l.memory, 0))}</b>
          </>,
          <div className="db-ss">
            {loads.map((l) => {
              const { session, place, name } = sessionTitle(l, sessions, projects);
              return (
                <button
                  key={l.sessionId}
                  type="button"
                  className="db-ssr sm"
                  disabled={!session}
                  onClick={() => session && openSession(session)}
                >
                  <SessionStatus session={session} />
                  <b>{place}</b>
                  <span className="wb-dim">{name}</span>
                  <span className={cn('db-num', `t-${tone(l.cpu, 10, 30)}`)}>{pct(l.cpu)}</span>
                  <span className="db-num">{mb(l.memory)}</span>
                </button>
              );
            })}
            {loads.length === 0 && <span className="wb-dim">Сессий Claude нет</span>}
          </div>,
        )}
        {hanging.length > 0 &&
          pill(
            'orph',
            <>
              <Ghost className="db-bic" />
              <b>{hanging.length}</b>
              <span className="db-bl">{plural(hanging.length, 'сирота', 'сироты', 'сирот')}</span>
              <b>{mb(hanging.reduce((a, r) => a + r.memory, 0))}</b>
            </>,
            <Orphans rows={rows} killer={killer} />,
            'bad',
          )}
      </div>
      {killer.dialog}
      <div className="wb-watching" role="status" title="Echo следит за изменениями конфига Claude">
        <i />
        следит
      </div>
    </div>
  );
}

function TokenProject({
  p,
  weekToday,
  project,
  onOpen,
}: {
  p: ProjectToday;
  weekToday: number | null;
  project: WorkbenchProject | undefined;
  onOpen: () => void;
}) {
  const name = project?.name ?? nameOf(p.path);
  const u = p.usage;
  const share = Math.round(p.share * 100);
  const n = u.todaySessions;
  const cache = Math.round(cacheShare(u) * 100);
  const filled = Math.round((100 - cache) / 10);
  const tip = cursorCard(
    <div className="tt">
      <div className="tt-h">
        <b>{name}</b>
        <span className="tt-v">
          {weekToday === null ? `${share}%` : `${pct(p.share * weekToday)}`}
          <span>{weekToday === null ? 'дня' : 'недели'}</span>
        </span>
      </div>
      <div className="tt-day">
        <span className="tt-bar">
          <i style={{ width: `${p.share * 100}%` }} />
        </span>
        {weekToday !== null && <span className="tt-cap">из ≈{pct(weekToday)} за день</span>}
      </div>
      <div className="tt-mix">
        <span className="tt-leg">
          <span>
            <i className="n" />
            новое {100 - cache}%
          </span>
          <span>
            <i className="c" />
            кэш {cache}%
          </span>
        </span>
        <span className="tt-dots">
          {DOTS.map((i) => (
            <i key={i} className={i < filled ? 'n' : 'c'} />
          ))}
        </span>
      </div>
    </div>,
  );
  const body = (
    <>
      <span className="db-tpm">
        <b>{name}</b>
        <span className="wb-dim">
          {n > 0 && `${n} ${plural(n, 'сессия', 'сессии', 'сессий')} · `}
          {tok(u.today)}
        </span>
        <span className="db-tpb">
          <i style={{ width: `${p.share * 100}%` }} />
        </span>
      </span>
      <b className="db-tpv">{weekToday === null ? `${share}%` : pct(p.share * weekToday)}</b>
    </>
  );
  if (!project)
    return (
      <span className="db-tp" {...tip}>
        {body}
        <span className="db-tpg" />
      </span>
    );
  return (
    <button type="button" className="db-tp" onClick={onOpen} {...tip}>
      {body}
      <ChevronRight className="db-tpg" />
    </button>
  );
}
