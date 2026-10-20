import { Bot, Server } from 'lucide-react';
import { useMemo } from 'react';
import { useWorkbenchProjects } from '@/hooks/use-workbench';
import {
  useGitStates,
  useProcesses,
  useRateLimits,
  useUsage,
} from '@/hooks/use-workbench-overview';
import { gitText, mb, mt, percent, resetText, topUsage } from '@/lib/overview';
import type { Limit } from '@/lib/types';
import { all } from '@/lib/workbench';
import { Processes } from './Processes';
import { ProjectIcon } from './ProjectIcon';

function Meter({ label, limit, weekly }: { label: string; limit: Limit | null; weekly: boolean }) {
  const value = percent(limit);
  return (
    <div className="wb-meter">
      <span className="wb-ml">
        <b>{label}</b>
        <span className="wb-dim">{resetText(limit, weekly)}</span>
        <span className="wb-mv">{value === null ? '—' : `${value}%`}</span>
      </span>
      <span className="wb-mt">
        <i style={{ width: `${value ?? 0}%` }} />
      </span>
    </div>
  );
}

export function Overview() {
  const { data: tree } = useWorkbenchProjects();
  const limits = useRateLimits().data ?? null;
  const { data: usage, isLoading: usagePending } = useUsage();
  const rows = useProcesses().data ?? [];

  const projects = useMemo(() => new Map((tree ? all(tree) : []).map((p) => [p.path, p])), [tree]);
  const top = useMemo(() => topUsage(usage, new Set(projects.keys())), [usage, projects]);
  const git = useGitStates(top.map(([path]) => path)).data;

  const today = usage ? Object.values(usage).reduce((s, u) => s + u.today, 0) : null;
  const sessionsOf = (path: string | null) =>
    new Set(rows.filter((r) => r.session && r.projectPath === path).map((r) => r.session)).size;
  const devOf = (path: string | null) =>
    rows.some((r) => r.guard === 'running-dev' && r.projectPath === path);
  const sessions = new Set(rows.filter((r) => r.session).map((r) => r.session)).size;
  const devs = new Set(
    rows
      .filter((r) => r.guard === 'running-dev' && r.projectPath != null)
      .map((r) => r.projectPath),
  ).size;
  const memory = rows.reduce((s, r) => s + r.memory, 0);
  const maxWeek = top[0]?.[1].week ?? 1;

  return (
    <>
      <div className="wb-ph">
        <span className="wb-pt">
          <b>Обзор</b>
        </span>
      </div>
      <div className="wb-ov">
        <div className="wb-dash a">
          <div className="wb-tiles">
            <div className="wb-tile">
              <Meter label="Лимит 5 часов" limit={limits?.fiveHour ?? null} weekly={false} />
            </div>
            <div className="wb-tile">
              <Meter label="Неделя" limit={limits?.sevenDay ?? null} weekly />
            </div>
            <div className="wb-tile">
              <span className="wb-big">{today === null ? '—' : mt(today)}</span>
              <span className="wb-dim">токенов сегодня</span>
            </div>
            <div className="wb-tile">
              <span className="wb-big">
                {sessions} · {devs}
              </span>
              <span className="wb-dim">Claude · dev запущено</span>
            </div>
          </div>
          <div className="wb-cols2">
            <div className="wb-sec">
              <div className="wb-sh">
                <b>Проекты</b>
                <span className="wb-dim">7 дней</span>
              </div>
              <div className="wb-tbl wb-scroll">
                <span className="wb-trh">
                  <span>Проект</span>
                  <span>Сейчас</span>
                  <span>Токены, 7 дней</span>
                  <span>Git</span>
                </span>
                {top.map(([path, u]) => {
                  const p = projects.get(path);
                  const n = sessionsOf(path);
                  return (
                    <span key={path} className="wb-trr">
                      <ProjectIcon svg={p?.icon ?? null} />
                      <b title={path}>{p?.name ?? path}</b>
                      <span className="wb-now">
                        {n > 0 && (
                          <span className="wb-gc" title="Сессии Claude">
                            <Bot />
                            {n}
                          </span>
                        )}
                        {devOf(path) && (
                          <span className="wb-gc" title="dev-сервер">
                            <Server />
                          </span>
                        )}
                      </span>
                      <span className="wb-tkb">
                        <i style={{ width: `${(u.week / maxWeek) * 100}%` }} />
                      </span>
                      <span className="wb-mb">{mt(u.week)}</span>
                      <span className="wb-dim">{gitText(git?.[path])}</span>
                    </span>
                  );
                })}
                {top.length === 0 && (
                  <span className="wb-dim">
                    {usagePending ? 'Загрузка…' : 'Нет данных за 7 дней'}
                  </span>
                )}
              </div>
            </div>
            <div className="wb-sec">
              <div className="wb-sh">
                <b>Процессы</b>
                <span className="wb-dim">{mb(memory)}</span>
              </div>
              <div className="wb-scroll">
                <Processes rows={rows} projects={projects} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
