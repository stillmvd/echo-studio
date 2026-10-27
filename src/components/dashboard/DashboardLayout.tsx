import { Bot, ChevronRight, Ghost, Power, Server } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenuProvider, useContextMenu } from '@/components/ui/ContextMenu';
import { ProcessLine, useProcessKiller } from '@/components/workbench/Processes';
import { ProjectIcon } from '@/components/workbench/ProjectIcon';
import { StatusIcon } from '@/components/workbench/StatusIcon';
import { useClaudeSessions, useWorkbenchProjects } from '@/hooks/use-workbench';
import {
  useGitStates,
  useLoad,
  useLoadHistory,
  useRateLimits,
  useUsage,
} from '@/hooks/use-workbench-overview';
import { cn } from '@/lib/cn';
import {
  dayLabel,
  FIVE_HOURS,
  memoryStack,
  pct,
  plural,
  type SessionLoad,
  sessionLoads,
  tok,
  tone,
  topModels,
  WEEK,
} from '@/lib/dashboard';
import { gitText, mb, nameOf, orphans, topUsage } from '@/lib/overview';
import type { ClaudeSession, Load, UsageReport, WorkbenchProject } from '@/lib/types';
import { places, statusView } from '@/lib/workbench';
import { goToTab } from '@/state/ui-store';
import { useWorkbenchStore } from '@/state/workbench-store';
import { LimitBar, Spark } from './parts';

export type DashboardSection = 'lim' | 'tok' | 'mod' | 'proj' | 'ses' | 'mach';

let pendingSection: DashboardSection | null = null;

export function openDashboard(section: DashboardSection) {
  pendingSection = section;
  goToTab('dashboard');
}

function Head({ title, right }: { title: string; right?: string }) {
  return (
    <div className="db-sh">
      <b>{title}</b>
      {right && <span className="wb-dim">{right}</span>}
    </div>
  );
}

function Section({
  id,
  className,
  children,
}: {
  id: DashboardSection;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`db-${id}`} className={cn('db-sec', `db-${id}`, className)}>
      {children}
    </section>
  );
}

function Limits() {
  const limits = useRateLimits().data ?? null;
  return (
    <Section id="lim">
      <Head title="Лимиты" />
      <div className="db-lms">
        <LimitBar label="5 часов" limit={limits?.fiveHour ?? null} window={FIVE_HOURS} />
        <LimitBar label="Неделя" limit={limits?.sevenDay ?? null} window={WEEK} />
      </div>
    </Section>
  );
}

function Tokens({ report }: { report: UsageReport | undefined }) {
  const s = report?.summary;
  const totals = s?.days.map((d) => d.input + d.output + d.cacheWrite) ?? [];
  const max = Math.max(1, ...totals);
  return (
    <Section id="tok">
      <Head title="Токены" right={s ? `${tok(s.week)} за 7 дней` : undefined} />
      {s ? (
        <>
          <div className="db-tks">
            <b>{tok(s.today)}</b> сегодня
            <span className="wb-dim">· из кэша прочитано {tok(s.cacheRead)}</span>
          </div>
          <div className="db-days">
            {s.days.map((d, i) => {
              const total = totals[i] ?? 0;
              return (
                <span
                  key={d.date}
                  className={cn('db-day', i === s.days.length - 1 && 'now')}
                  title={`${d.date}: ответы ${tok(d.output)}, запись в кэш ${tok(d.cacheWrite)}, ввод ${tok(d.input)}`}
                >
                  <span className="db-dv">{total ? tok(total) : ''}</span>
                  <span className="db-dst" style={{ height: `${(total / max) * 100}%` }}>
                    <i className="cw" style={{ flexGrow: d.cacheWrite }} />
                    <i className="out" style={{ flexGrow: d.output + d.input }} />
                  </span>
                  <span className="db-dd">{dayLabel(d.date)}</span>
                </span>
              );
            })}
          </div>
          <div className="db-lg">
            <span>
              <i className="out" />
              ответы
            </span>
            <span>
              <i className="cw" />
              запись в кэш
            </span>
          </div>
        </>
      ) : (
        <span className="wb-dim">Загрузка…</span>
      )}
    </Section>
  );
}

function Models({ report }: { report: UsageReport | undefined }) {
  const s = report?.summary;
  const models = s ? topModels(s.models) : [];
  const total = models.reduce((a, [, v]) => a + v, 0);
  const share = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <Section id="mod">
      <Head title="Модели" right="7 дней" />
      {total > 0 && (
        <>
          <div className="db-share">
            {models.map(([name, v], i) => (
              <i
                key={name}
                className={`m${i}`}
                style={{ flexGrow: v }}
                title={`${name} · ${tok(v)}`}
              />
            ))}
          </div>
          <div className="db-mlg">
            {models.map(([name, v], i) => (
              <span key={name}>
                <i className={`m${i}`} />
                {name}
                <b>{share(v)}%</b>
              </span>
            ))}
          </div>
          <div className="db-msub">
            <Bot />
            <span>Субагенты</span>
            <b>{tok(s?.sub ?? 0)}</b>
            <span className="wb-dim">{share(s?.sub ?? 0)}%</span>
          </div>
        </>
      )}
    </Section>
  );
}

function Projects({
  report,
  projects,
  rows,
}: {
  report: UsageReport | undefined;
  projects: Map<string, WorkbenchProject>;
  rows: Load['rows'];
}) {
  const top = useMemo(
    () => topUsage(report?.projects, new Set(projects.keys()), 6),
    [report, projects],
  );
  const git = useGitStates(top.map(([path]) => path)).data;
  const maxWeek = top[0]?.[1].week ?? 1;
  return (
    <Section id="proj">
      <Head title="Проекты" right="7 дней" />
      <div className="wb-tbl">
        {top.map(([path, u]) => {
          const p = projects.get(path);
          const n = new Set(
            rows
              .filter((r) => r.session && !r.orphan && r.projectPath === path)
              .map((r) => r.session),
          ).size;
          const dev = rows.some((r) => r.guard === 'running-dev' && r.projectPath === path);
          return (
            <span key={path} className="wb-trr">
              <ProjectIcon svg={p?.icon ?? null} />
              <b title={path}>{p?.name ?? nameOf(path)}</b>
              <span className="wb-now">
                {n > 0 && (
                  <span className="wb-gc" title="Сессии Claude">
                    <Bot />
                    {n}
                  </span>
                )}
                {dev && (
                  <span className="wb-gc" title="dev-сервер">
                    <Server />
                  </span>
                )}
              </span>
              <span className="wb-tkb">
                <i style={{ width: `${(u.week / maxWeek) * 100}%` }} />
              </span>
              <span className="wb-mb">{tok(u.week)}</span>
              <span className="wb-dim">{gitText(git?.[path])}</span>
            </span>
          );
        })}
        {top.length === 0 && (
          <span className="wb-dim">{report ? 'Нет данных за 7 дней' : 'Загрузка…'}</span>
        )}
      </div>
    </Section>
  );
}

export function sessionTitle(
  s: SessionLoad,
  live: ClaudeSession[],
  projects: Map<string, WorkbenchProject>,
) {
  const session = live.find((x) => x.sessionId === s.sessionId);
  const project = s.projectPath ? projects.get(s.projectPath) : undefined;
  return {
    session,
    place: project?.name ?? (s.projectPath ? nameOf(s.projectPath) : 'без папки'),
    name: session?.name || `Claude ${s.sessionId.slice(0, 8)}`,
  };
}

export function SessionStatus({ session }: { session: ClaudeSession | undefined }) {
  const seen = useWorkbenchStore((s) => s.seen);
  if (!session) return <span className="wb-gl sm" />;
  return (
    <StatusIcon
      small
      session={{ status: statusView(session, seen), phase: session.phase }}
      seed={session.sessionId}
    />
  );
}

function Sessions({
  rows,
  live,
  projects,
}: {
  rows: Load['rows'];
  live: ClaudeSession[];
  projects: Map<string, WorkbenchProject>;
}) {
  const loads = useMemo(() => sessionLoads(rows), [rows]);
  const history = useLoadHistory((s) => s.sessions);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const killer = useProcessKiller();
  const toggle = (id: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const memory = loads.reduce((a, s) => a + s.memory, 0);
  return (
    <Section id="ses">
      <Head
        title="Сессии Claude"
        right={loads.length ? `${loads.length} · ${mb(memory)}` : undefined}
      />
      {killer.note && <span className="wb-pnote">{killer.note}</span>}
      <div className="db-ss wb-scroll">
        {loads.map((s) => {
          const { session, place, name } = sessionTitle(s, live, projects);
          const t = tone(s.cpu, 10, 30);
          const expanded = open.has(s.sessionId);
          return (
            <div key={s.sessionId} className="db-ssg">
              <button
                type="button"
                className={cn('db-ssr', expanded && 'open')}
                aria-expanded={expanded}
                onClick={() => toggle(s.sessionId)}
              >
                <ChevronRight className="db-chev" />
                <SessionStatus session={session} />
                <b>{place}</b>
                <span className="wb-dim">{name}</span>
                <Spark values={history[s.sessionId] ?? []} w={96} h={24} floor={5} t={t} />
                <span className={cn('db-num', `t-${t}`)}>{pct(s.cpu)}</span>
                <span className="db-num">{mb(s.memory)}</span>
                <span className="db-num wb-dim">
                  {s.rows.length} {plural(s.rows.length, 'процесс', 'процесса', 'процессов')}
                </span>
              </button>
              {expanded &&
                s.rows.map((r) => <ProcessLine key={r.pid} row={r} on={killer.on} nested />)}
            </div>
          );
        })}
        {loads.length === 0 && <span className="wb-dim">Сессий Claude нет</span>}
      </div>
      {killer.dialog}
    </Section>
  );
}

export function Orphans({
  rows,
  killer,
}: {
  rows: Load['rows'];
  killer: ReturnType<typeof useProcessKiller>;
}) {
  const list = orphans(rows);
  if (!list.length) return null;
  return (
    <div className="db-orph">
      <span className="db-oh">
        <Ghost />
        <b>Сироты</b>
        <span className="wb-dim">
          {list.length} · {mb(list.reduce((a, r) => a + r.memory, 0))}
        </span>
        <button
          type="button"
          className="wb-btn sm"
          disabled={killer.busy}
          onClick={() => killer.killAll(list)}
        >
          <Power />
          Завершить все
        </button>
      </span>
      {killer.note && <span className="wb-pnote">{killer.note}</span>}
      {list.map((r) => (
        <ProcessLine key={r.pid} row={r} on={killer.on} />
      ))}
    </div>
  );
}

function Machine({ load }: { load: Load | undefined }) {
  const history = useLoadHistory((s) => s.machine);
  const killer = useProcessKiller();
  if (!load) {
    return (
      <Section id="mach">
        <Head title="Машина" />
        <span className="wb-dim">Загрузка…</span>
      </Section>
    );
  }
  const m = load.machine;
  const memP = m.memoryTotal ? (m.memoryUsed / m.memoryTotal) * 100 : 0;
  const claude = sessionLoads(load.rows).reduce((a, s) => a + s.memory, 0);
  const orphanMem = orphans(load.rows).reduce((a, r) => a + r.memory, 0);
  const segs = memoryStack(claude, orphanMem, m.others, m.memoryUsed, m.memoryTotal);
  return (
    <Section id="mach">
      <Head title="Машина" right={`${m.cores} ${plural(m.cores, 'ядро', 'ядра', 'ядер')}`} />
      <div className="db-mh">
        <b>Память</b>
        <span className={cn('db-num', `t-${tone(memP)}`)}>
          {mb(m.memoryUsed)} из {mb(m.memoryTotal)}
        </span>
      </div>
      <div className="db-stack">
        {segs.map((s) => (
          <i
            key={s.key}
            className={`s-${s.kind}`}
            style={{ flexGrow: Math.max(s.memory, 1) }}
            title={`${s.label} · ${mb(s.memory)}`}
          />
        ))}
      </div>
      <div className="db-slg">
        {segs
          .filter((s) => s.kind !== 'rest')
          .map((s) => (
            <span key={s.key}>
              <i className={`s-${s.kind}`} />
              {s.label}
              <span className="wb-dim">{mb(s.memory)}</span>
            </span>
          ))}
      </div>
      <div className="db-cpu">
        <b>CPU</b>
        <Spark values={history} w={160} h={22} floor={100} t={tone(m.cpu)} />
        <span className={cn('db-num', `t-${tone(m.cpu)}`)}>{pct(m.cpu)}</span>
      </div>
      <Orphans rows={load.rows} killer={killer} />
      {killer.dialog}
    </Section>
  );
}

export function DashboardLayout() {
  const menu = useContextMenu();
  const { data: tree } = useWorkbenchProjects();
  const { data: report } = useUsage();
  const { data: load } = useLoad();
  const live = useClaudeSessions();
  const projects = useMemo(
    () => new Map((tree ? places(tree) : []).map((p) => [p.path, p])),
    [tree],
  );
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const section = pendingSection;
    pendingSection = null;
    if (!section) return;
    const el = root.current?.querySelector<HTMLElement>(`#db-${section}`);
    el?.scrollIntoView({ block: 'nearest' });
    el?.classList.add('flash');
    const t = setTimeout(() => el?.classList.remove('flash'), 1200);
    return () => clearTimeout(t);
  }, []);
  const rows = load?.rows ?? [];
  return (
    <ContextMenuProvider value={menu.open}>
      <div className="wb-root db-root" ref={root}>
        <div className="wb-card db-main">
          <div className="db-ph">
            <h2 className="wb-title">
              <b>Дашборд</b>
            </h2>
          </div>
          <div className="db-ly">
            <Limits />
            <div className="db-ly2">
              <Tokens report={report} />
              <Models report={report} />
              <Projects report={report} projects={projects} rows={rows} />
              <Sessions rows={rows} live={live} projects={projects} />
              <Machine load={load} />
            </div>
          </div>
        </div>
        {menu.element}
      </div>
    </ContextMenuProvider>
  );
}
