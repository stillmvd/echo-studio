import { checkNow, installNow, useShip } from '@stillmvd/tauri-ship';
import {
  Bot,
  Check,
  ChevronDown,
  Database,
  Download,
  EyeOff,
  FileCog,
  Folder,
  LayoutGrid,
  Loader2,
  type LucideIcon,
  MessageSquare,
  RefreshCw,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAgents, useKimiReadiness, useSetAgent } from '@/hooks/use-agent';
import { useConversationProjects } from '@/hooks/use-conversations';
import { useConfigBackups } from '@/hooks/use-tooling';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/dashboard';
import { kimiOpenTerminal, kimiSyncAll, revealInExplorer } from '@/lib/ipc';
import { formatAgo, formatBytes } from '@/lib/projects';
import { dayLabel, formatTime } from '@/lib/sessions';
import type { AgentKind, AgentProfile, ConfigBackup } from '@/lib/types';
import { shortPath } from '@/lib/workbench';
import {
  isRunning,
  type StepMark,
  type StepMarks,
  type SwitchStep,
  useKimiSwitch,
} from '@/state/kimi-switch-store';
import { useWorkbenchStore } from '@/state/workbench-store';
import { version } from '../../../package.json';
import { panelCard } from './panels';
import { EchoMark } from './Titlebar';

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'agent', label: 'Агент', icon: Bot },
  { id: 'claude', label: 'Конфиг Claude', icon: FileCog },
  { id: 'backups', label: 'Копии конфига', icon: Database },
  { id: 'conversations', label: 'Сессии', icon: MessageSquare },
  { id: 'workbench', label: 'Рабочее место', icon: LayoutGrid },
  { id: 'updates', label: 'Обновления', icon: Download },
];

const softFill = 'bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]';
const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-0';

function stampToIso(stamp: string): string | null {
  const m = stamp.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function reveal(path: string) {
  revealInExplorer(path).catch(() => {});
}

export function SettingsLayout() {
  const projects = useConversationProjects();
  const backups = useConfigBackups();
  const agents = useAgents();
  const claude = agents.data?.agents.find((a) => a.kind === 'claude');

  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(SECTIONS[0]?.id ?? '');

  const totalConvSize = (projects.data ?? []).reduce((s, p) => s + p.totalSize, 0);
  const totalSessions = (projects.data ?? []).reduce((s, p) => s + p.sessionCount, 0);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (
      el.scrollHeight > el.clientHeight + 4 &&
      el.scrollTop + el.clientHeight >= el.scrollHeight - 4
    ) {
      setActive(SECTIONS[SECTIONS.length - 1]?.id ?? '');
      return;
    }
    const top = el.getBoundingClientRect().top;
    let current = SECTIONS[0]?.id ?? '';
    for (const s of SECTIONS) {
      const node = document.getElementById(`settings-${s.id}`);
      if (node && node.getBoundingClientRect().top - top <= 96) current = s.id;
    }
    setActive(current);
  }

  function goTo(id: string) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById(`settings-${id}`)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
  }

  return (
    <div className={cn(panelCard, 'h-full @container')}>
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 pt-6 pb-24">
        <div className="mx-auto flex max-w-[940px] flex-col gap-[22px]">
          <header className="flex items-center gap-4 px-1">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-accent)]">
              <EchoMark className="h-7 w-7 drop-shadow-[0_0_8px_var(--color-glow-strong)]" />
            </span>
            <span className="flex min-w-0 flex-col gap-2">
              <h1 className="text-[28px] leading-[1.06] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
                Echo <b className="font-bold">Studio</b>
              </h1>
              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                v{version} · Tauri 2 · React 19 · Rust
              </span>
            </span>
          </header>

          <div className="grid grid-cols-[188px_minmax(0,1fr)] items-start gap-5 @max-[640px]:grid-cols-1">
            <nav
              aria-label="Разделы настроек"
              className="sticky top-0 flex flex-col gap-1 @max-[640px]:static @max-[640px]:flex-row @max-[640px]:overflow-x-auto"
            >
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => goTo(id)}
                  aria-current={active === id ? 'true' : undefined}
                  className={cn(
                    'flex h-10 shrink-0 items-center gap-2.5 rounded-full pr-4 pl-3 text-sm whitespace-nowrap transition-colors duration-200 ease-[var(--ease-trail)] @max-[640px]:h-9',
                    focusRing,
                    active === id
                      ? 'bg-[var(--color-text-primary)] font-bold text-[var(--color-bg-primary)]'
                      : 'font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]',
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </nav>

            <div className="flex min-w-0 flex-col gap-3.5">
              <Section
                id="agent"
                title="Агент"
                subtitle="Чей CLI, конфиг и сессии показывает Echo. Память echo-memory и статусы сессий у агентов общие."
              >
                {agents.isLoading ? (
                  <Skeleton />
                ) : agents.isError ? (
                  <Tag tone="warn" title={String(agents.error)}>
                    не удалось прочитать профили агентов
                  </Tag>
                ) : (
                  <AgentChoice
                    current={agents.data?.current ?? 'claude'}
                    agents={agents.data?.agents ?? []}
                  />
                )}
              </Section>

              <Section
                id="claude"
                title="Конфиг Claude"
                subtitle="Конфигурация Claude Code, которую читает вкладка «Инструменты»."
              >
                <Rows>
                  <Row label="Папка конфига">
                    <PathValue path={claude?.home ?? '~/.claude'} />
                    {claude && <RevealButton path={claude.home} />}
                  </Row>
                  <Row label="Настройки">
                    <PathValue path={claude?.settings ?? '~/.claude/settings.json'} />
                    {claude && <RevealButton path={claude.settings} />}
                  </Row>
                  <Row label="MCP и проекты">
                    <PathValue path={claude?.mcp ?? '~/.claude.json'} />
                    {claude && <RevealButton path={claude.mcp} />}
                  </Row>
                </Rows>
              </Section>

              <Section
                id="backups"
                title="Копии конфига"
                subtitle="Копия файла конфига Claude перед каждым переключением в «Инструментах». Хранятся последние 20 на файл."
              >
                {backups.isLoading ? (
                  <Skeleton />
                ) : backups.isError ? (
                  <Tag tone="warn" title={String(backups.error)}>
                    не удалось получить копии
                  </Tag>
                ) : (
                  <Backups items={backups.data ?? []} />
                )}
              </Section>

              <Section
                id="conversations"
                title="Сессии"
                subtitle="Логи сессий Claude Code. Только чтение, пока вы не переименуете или не удалите сессию."
              >
                <Rows>
                  <Row label="Корень проектов">
                    <PathValue path={claude?.sessions ?? '~/.claude/projects'} />
                    {claude && <RevealButton path={claude.sessions} />}
                  </Row>
                  <Row label="Всего">
                    {projects.isLoading ? (
                      <Skeleton short />
                    ) : projects.isError ? (
                      <Tag tone="warn" title={String(projects.error)}>
                        не удалось прочитать проекты
                      </Tag>
                    ) : (
                      <>
                        <Tag tone="ok">
                          {projects.data?.length ?? 0}{' '}
                          {plural(projects.data?.length ?? 0, 'проект', 'проекта', 'проектов')}
                        </Tag>
                        <Tag tone="ok">
                          {totalSessions} {plural(totalSessions, 'сессия', 'сессии', 'сессий')}
                        </Tag>
                        <Tag tone="ok">{formatBytes(totalConvSize)}</Tag>
                      </>
                    )}
                  </Row>
                </Rows>
              </Section>

              <Section
                id="workbench"
                title="Рабочее место"
                subtitle="Скрытые проекты не показываются в дереве; их сессии, dev-серверы и процессы по-прежнему видны в «Запущено» и «Процессах»."
              >
                <HiddenProjects />
              </Section>

              <Section
                id="updates"
                title="Обновления"
                subtitle="Новые версии скачиваются в фоне из GitHub Releases. «Перезапустить» ставит их: Windows один раз запросит права администратора, затем приложение откроется снова."
              >
                <Updates />
              </Section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function checkedAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'проверено только что';
  if (minutes < 60) return `проверено ${minutes} мин назад`;
  return `проверено в ${formatTime(new Date(ms).toISOString())}`;
}

function Updates() {
  const { status } = useShip();
  const [checking, setChecking] = useState(false);
  const phase = status?.phase ?? 'idle';
  const available = status?.available ?? null;
  const busy =
    checking || phase === 'checking' || phase === 'downloading' || phase === 'installing';
  const percent = status?.total ? Math.round((status.downloaded / status.total) * 100) : null;

  async function check() {
    setChecking(true);
    try {
      await checkNow();
    } finally {
      setChecking(false);
    }
  }

  return (
    <Rows>
      <Row label="Установлена">
        <span>v{status?.current ?? version}</span>
        {checking || phase === 'checking' ? (
          <Tag>проверка…</Tag>
        ) : status?.lastCheck && !available && !status.error ? (
          <Tag tone="ok">последняя версия</Tag>
        ) : null}
        {status?.lastCheck && !checking && phase !== 'checking' ? (
          <Tag>{checkedAgo(status.lastCheck)}</Tag>
        ) : null}
        <button
          type="button"
          onClick={check}
          disabled={busy}
          className={cn(
            'ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-xs font-medium whitespace-nowrap text-[var(--color-text-primary)] transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)] active:scale-[.96] disabled:pointer-events-none disabled:opacity-50',
            softFill,
            focusRing,
          )}
        >
          <RefreshCw
            className={cn(
              'h-3.5 w-3.5 text-[var(--color-text-muted)]',
              (checking || phase === 'checking') && 'animate-spin motion-reduce:animate-none',
            )}
            strokeWidth={1.75}
          />
          Проверить
        </button>
      </Row>
      {available && (
        <Row label="Доступна">
          <span>v{available.version}</span>
          {phase === 'downloading' ? (
            <Tag>
              {status?.downloaded
                ? `загрузка ${formatBytes(status.downloaded)}${status.total ? ` из ${formatBytes(status.total)}` : ''}`
                : 'загрузка…'}
            </Tag>
          ) : phase === 'installing' ? (
            <Tag>установка, приложение перезапустится</Tag>
          ) : phase === 'ready' ? (
            <Tag tone="ok">загружена</Tag>
          ) : null}
          {(phase === 'ready' || phase === 'installing') && (
            <button
              type="button"
              onClick={() => {
                installNow().catch(() => {});
              }}
              disabled={phase === 'installing'}
              aria-busy={phase === 'installing'}
              className={cn(
                'ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold whitespace-nowrap bg-[var(--color-accent)] text-[var(--color-accent-fg)] transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-accent-hover)] active:scale-[.96] disabled:pointer-events-none disabled:opacity-50',
                focusRing,
              )}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              Перезапустить
            </button>
          )}
          {phase === 'downloading' && (
            <span
              role="progressbar"
              aria-label="Загрузка обновления"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
              className="block h-1 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)]"
            >
              <i
                className="block h-full origin-left rounded-full bg-[var(--color-accent)] transition-transform duration-200 ease-[var(--ease-trail)]"
                style={{ transform: `scaleX(${(percent ?? 0) / 100})` }}
              />
            </span>
          )}
        </Row>
      )}
      {status?.error && (
        <Row label="Ошибка">
          <span className="min-w-0 text-xs font-medium text-[var(--color-warning)] [overflow-wrap:anywhere]">
            {status.error}
          </span>
        </Row>
      )}
    </Rows>
  );
}

const STEP_LABEL: Record<SwitchStep, string> = {
  sync: 'Перенести настройки Claude в Kimi для всех проектов ~/Projects и обновить плагин памяти (сбой плагина переход не останавливает)',
  agent: 'Переключить Echo на Kimi: Рабочее место, Сессии и Инструменты покажут Kimi',
  import: 'Открыть окно Kimi с импортом сессий Claude — там выбрать 15 или 30 дней',
};

function agoText(iso: string): string {
  const a = formatAgo(iso);
  return a === 'сейчас' ? 'только что' : `${a} назад`;
}

const softButton = cn(
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap select-none text-[var(--color-text-primary)] transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)] active:scale-[.96] disabled:pointer-events-none disabled:opacity-50',
  softFill,
  focusRing,
);

function AgentChoice({ current, agents }: { current: AgentKind; agents: AgentProfile[] }) {
  const choose = useSetAgent(false);
  const [watchLogin, setWatchLogin] = useState(false);
  const ready = useKimiReadiness(watchLogin);
  const { marks, error, notice, withImport, patch } = useKimiSwitch();
  const setError = (e: string | null) => patch({ error: e });
  const loginBefore = useRef<string | null>(null);
  const switchButton = useRef<HTMLButtonElement>(null);
  const kimi = agents.find((a) => a.kind === 'kimi');
  const r = ready.data;
  const running = isRunning(marks);
  const failed = marks ? Object.values(marks).includes('fail') : false;
  const busy = running || choose.isPending;
  const steps: SwitchStep[] = withImport ? ['sync', 'agent', 'import'] : ['sync', 'agent'];
  const blocker = !kimi?.cli
    ? 'Kimi Code не установлен'
    : ready.isError
      ? `Не удалось проверить готовность Kimi: ${String(ready.error)}`
      : !r
        ? 'Проверяем готовность Kimi…'
        : !r.node
          ? 'Не найден node.exe — поставь Node.js'
          : !r.script
            ? 'В плагине echo-memory нет переноса в Kimi — обнови плагин в Claude (/plugin)'
            : !r.login
              ? 'Сначала войдите в Kimi'
              : null;

  useEffect(() => {
    if (!watchLogin) return;
    if ((r?.login ?? null) !== loginBefore.current) {
      setWatchLogin(false);
      return;
    }
    const t = setTimeout(() => setWatchLogin(false), 180_000);
    return () => clearTimeout(t);
  }, [watchLogin, r?.login]);

  function login() {
    loginBefore.current = r?.login ?? null;
    setError(null);
    kimiOpenTerminal('login').then(
      () => setWatchLogin(true),
      (e) => setError(String(e)),
    );
  }

  async function toKimi() {
    if (blocker || isRunning(useKimiSwitch.getState().marks) || choose.isPending) return;
    const order = steps;
    const next: StepMarks = Object.fromEntries(order.map((s) => [s, 'wait']));
    const mark = (s: SwitchStep, m: StepMark) => {
      next[s] = m;
      patch({ marks: { ...next } });
    };
    const actions: Record<SwitchStep, () => Promise<unknown>> = {
      sync: async () => patch({ notice: await kimiSyncAll() }),
      agent: () => choose.mutateAsync('kimi'),
      import: () => kimiOpenTerminal('import'),
    };
    patch({ error: null, notice: null, marks: { ...next } });
    for (const s of order) {
      mark(s, 'run');
      try {
        await actions[s]();
        mark(s, 'ok');
      } catch (e) {
        mark(s, 'fail');
        setError(String(e));
        break;
      }
    }
    void ready.refetch();
  }

  function reimport() {
    setError(null);
    kimiOpenTerminal('import').catch((e) => setError(String(e)));
  }

  function toClaude() {
    if (busy) return;
    patch({ marks: null, error: null, notice: null });
    choose.mutate('claude', { onError: (e) => setError(String(e)) });
  }

  const title = running
    ? 'Переход на Kimi'
    : current === 'kimi'
      ? marks
        ? failed
          ? 'Kimi включён, окно импорта не открылось'
          : 'Переход на Kimi выполнен'
        : 'Обратный ход'
      : failed
        ? 'Переход на Kimi прерван'
        : 'Переход на Kimi';

  const sync = r?.sync;
  const warnings = sync?.warnings ?? [];
  const skippedHooks = sync?.skippedHooks ?? [];
  const shown = marks ? (Object.keys(marks) as SwitchStep[]) : steps;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Rows>
        <Row label="Работать с">
          <fieldset
            aria-label="Агент"
            className={cn('inline-flex h-9 shrink-0 items-center gap-1 rounded-full p-1', softFill)}
          >
            {agents.map((a) => {
              const on = a.kind === current;
              const missing = !a.cli && !on;
              return (
                <button
                  key={a.kind}
                  type="button"
                  aria-pressed={on}
                  aria-disabled={missing || busy}
                  title={
                    missing
                      ? `${a.exe} не найден ни в PATH, ни в ${a.bin}`
                      : !on && a.kind === 'kimi'
                        ? 'Переход — кнопкой «Перейти на Kimi» ниже'
                        : undefined
                  }
                  onClick={() => {
                    if (on || missing || busy) return;
                    if (a.kind === 'kimi') {
                      switchButton.current?.scrollIntoView({ block: 'nearest' });
                      switchButton.current?.focus();
                    } else toClaude();
                  }}
                  className={cn(
                    'inline-flex h-7 w-[112px] items-center justify-center rounded-full text-xs whitespace-nowrap select-none transition-colors duration-200 ease-[var(--ease-trail)] aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                    focusRing,
                    on
                      ? 'bg-[var(--color-text-primary)] font-bold text-[var(--color-bg-primary)]'
                      : 'font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]',
                  )}
                >
                  {a.name}
                </button>
              );
            })}
          </fieldset>
        </Row>
        {agents.map((a) => (
          <Row key={a.kind} label={a.name}>
            {a.cli ? (
              <>
                <Tag tone="ok">установлен</Tag>
                <PathValue path={a.cli} />
              </>
            ) : (
              <Tag tone="warn" title={a.bin}>
                {a.exe} не найден
              </Tag>
            )}
            <RevealButton path={a.home} label="Данные" />
          </Row>
        ))}
        {kimi?.cli && (
          <>
            <Row label="Вход в Kimi">
              {r?.login ? (
                <Tag tone="ok">выполнен {agoText(r.login)}</Tag>
              ) : (
                <Tag tone="warn">не выполнен</Tag>
              )}
              {watchLogin && <Tag>ждём вход в окне терминала…</Tag>}
              <button type="button" onClick={login} className={cn('ml-auto w-[112px]', softButton)}>
                {r?.login ? 'Войти заново' : 'Войти'}
              </button>
            </Row>
            <Row label="Перенос настроек">
              {sync?.at ? (
                <>
                  <Tag tone="ok">{agoText(sync.at)}</Tag>
                  <SoftChip
                    value={sync.hooks ?? 0}
                    unit={plural(sync.hooks ?? 0, 'хук', 'хука', 'хуков')}
                  />
                  <SoftChip
                    value={sync.commands ?? 0}
                    unit={plural(sync.commands ?? 0, 'команда', 'команды', 'команд')}
                  />
                  {skippedHooks.length > 0 && (
                    <Tag title={`Нет аналога в Kimi:\n${skippedHooks.join('\n')}`}>
                      не перенесено: {skippedHooks.length}
                    </Tag>
                  )}
                </>
              ) : (
                <Tag>ещё не было</Tag>
              )}
              {warnings.length > 0 && (
                <Tag tone="warn" title={warnings.join('\n')}>
                  {warnings.length}{' '}
                  {plural(warnings.length, 'предупреждение', 'предупреждения', 'предупреждений')}
                </Tag>
              )}
            </Row>
            <Row label="Плагин памяти">
              {sync?.pluginError ? (
                <Tag tone="warn" title={sync.pluginError}>
                  ошибка установки
                </Tag>
              ) : r?.memoryPlugin ? (
                <Tag tone="ok">
                  {sync?.plugin?.version ? `v${sync.plugin.version} в Kimi` : 'установлен в Kimi'}
                </Tag>
              ) : (
                <Tag>не установлен в Kimi</Tag>
              )}
            </Row>
          </>
        )}
      </Rows>

      {!kimi?.cli && (
        <div className="flex min-w-0 flex-col gap-3 rounded-[16px] bg-[var(--color-bg-secondary)] px-4 pt-3.5 pb-4">
          <h3 className="text-[13px] font-bold text-[var(--color-text-primary)]">
            {current === 'kimi' ? 'Kimi не найден' : 'Kimi Code не установлен'}
          </h3>
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            {current === 'kimi'
              ? `Echo работает с Kimi, но ${kimi?.exe ?? 'kimi.exe'} нет ни в PATH, ни в ${kimi?.bin ?? '~/.kimi-code/bin'}. Переустанови Kimi Code или вернись к Claude.`
              : 'Поставь Kimi Code (нужен Git for Windows) — Echo увидит его сам, когда вернёшься в окно.'}
          </p>
          {error && (
            <p className="text-xs font-medium text-[var(--color-warning)] [overflow-wrap:anywhere]">
              {error}
            </p>
          )}
          {current === 'kimi' && (
            <button
              type="button"
              onClick={toClaude}
              disabled={busy}
              className={cn('w-[168px]', softButton)}
            >
              Вернуться к Claude
            </button>
          )}
        </div>
      )}

      {kimi?.cli && (
        <div className="flex min-w-0 flex-col gap-3 rounded-[16px] bg-[var(--color-bg-secondary)] px-4 pt-3.5 pb-4">
          <h3 className="text-[13px] font-bold text-[var(--color-text-primary)]">{title}</h3>
          {(current === 'claude' || marks) && (
            <ol className="flex min-w-0 flex-col gap-2">
              {shown.map((s, i) => (
                <li
                  key={s}
                  className="flex min-w-0 items-start gap-2.5 text-[13px] font-medium text-[var(--color-text-primary)]"
                >
                  <StepBadge n={i + 1} mark={marks?.[s]} />
                  <span className="min-w-0 pt-px">{STEP_LABEL[s]}</span>
                </li>
              ))}
            </ol>
          )}
          {current === 'claude' && (
            <label className="flex w-fit items-center gap-2 text-[13px] font-medium text-[var(--color-text-primary)] select-none">
              <input
                type="checkbox"
                checked={withImport}
                disabled={busy}
                onChange={(e) => patch({ withImport: e.target.checked, marks: null, error: null })}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              Импортировать сессии Claude в Kimi
            </label>
          )}
          {notice && (
            <p className="text-xs font-medium text-[var(--color-warning)] [overflow-wrap:anywhere]">
              {notice}
            </p>
          )}
          <p className="text-xs font-medium text-[var(--color-text-muted)]">
            {current === 'kimi' && !running
              ? 'Echo вернётся к Claude: Рабочее место, Сессии и Инструменты снова покажут Claude. Настройки, плагин и сессии Kimi остаются на месте — переход можно повторить.'
              : 'Claude и его конфиг не меняются. Вернуться можно здесь же, кнопкой «Вернуться к Claude».'}
          </p>
          {error && (
            <p className="text-xs font-medium text-[var(--color-warning)] [overflow-wrap:anywhere]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {current === 'kimi' ? (
              <>
                <button
                  type="button"
                  onClick={toClaude}
                  disabled={busy}
                  className={cn('w-[168px]', softButton)}
                >
                  Вернуться к Claude
                </button>
                <button
                  type="button"
                  onClick={reimport}
                  disabled={busy}
                  className={cn('w-[200px]', softButton)}
                >
                  Импортировать сессии Claude
                </button>
              </>
            ) : (
              <button
                ref={switchButton}
                type="button"
                onClick={() => void toKimi()}
                disabled={!!blocker || busy}
                aria-busy={running}
                className={cn(
                  'inline-flex h-8 w-[168px] shrink-0 items-center justify-center rounded-full text-xs font-bold whitespace-nowrap select-none bg-[var(--color-accent)] text-[var(--color-accent-fg)] transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-accent-hover)] active:scale-[.96] disabled:pointer-events-none disabled:opacity-50',
                  focusRing,
                )}
              >
                {running ? 'Переход…' : 'Перейти на Kimi'}
              </button>
            )}
            {current === 'claude' && blocker && (
              <span className="text-xs font-medium text-[var(--color-text-muted)]">{blocker}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StepBadge({ n, mark }: { n: number; mark: StepMark | undefined }) {
  return (
    <span
      className={cn(
        'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums',
        mark === 'ok'
          ? 'bg-[var(--color-success)] text-[var(--color-bg-primary)]'
          : mark === 'fail'
            ? 'bg-[var(--color-warning)] text-[var(--color-bg-primary)]'
            : cn('text-[var(--color-text-muted)]', softFill),
      )}
    >
      {mark === 'ok' ? (
        <Check className="h-3 w-3" strokeWidth={2.5} aria-label="готово" />
      ) : mark === 'fail' ? (
        <X className="h-3 w-3" strokeWidth={2.5} aria-label="ошибка" />
      ) : mark === 'run' ? (
        <Loader2
          className="h-3 w-3 animate-spin motion-reduce:animate-none"
          strokeWidth={2.5}
          aria-label="идёт"
        />
      ) : (
        n
      )}
    </span>
  );
}

function HiddenProjects() {
  const hidden = useWorkbenchStore((s) => s.hiddenProjects);
  const unhide = useWorkbenchStore((s) => s.unhideProject);
  return (
    <Rows>
      <Row label="Скрытые проекты">
        {hidden.length === 0 ? (
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Скрытых проектов нет. Скрыть можно из меню проекта в дереве
          </span>
        ) : (
          <ul className="flex w-full min-w-0 flex-col gap-1.5">
            {hidden.map((path) => (
              <li key={path} className="flex min-w-0 items-center gap-2">
                <EyeOff
                  className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <PathValue path={shortPath(path)} />
                <button
                  type="button"
                  onClick={() => unhide(path)}
                  title={`Вернуть ${path} в дерево`}
                  className={cn(
                    'ml-auto inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium whitespace-nowrap text-[var(--color-text-primary)] transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)] active:scale-[.96]',
                    softFill,
                    focusRing,
                  )}
                >
                  Вернуть
                </button>
              </li>
            ))}
          </ul>
        )}
      </Row>
    </Rows>
  );
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`settings-${id}`}
      aria-labelledby={`settings-${id}-title`}
      className="flex min-w-0 scroll-mt-1 flex-col gap-3 rounded-[20px] bg-[var(--color-bg-tertiary)] px-5 pt-[18px] pb-5"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2
          id={`settings-${id}-title`}
          className="text-[15px] font-bold tracking-[-0.01em] text-[var(--color-text-primary)]"
        >
          {title}
        </h2>
        <p className="text-xs font-medium text-[var(--color-text-muted)]">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <dl className="flex min-w-0 flex-col gap-2.5">{children}</dl>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[150px_minmax(0,1fr)] items-center gap-x-4 gap-y-1 @max-[640px]:grid-cols-1">
      <dt className="text-[13px] font-medium whitespace-nowrap text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm font-medium text-[var(--color-text-primary)] tabular-nums">
        {children}
      </dd>
    </div>
  );
}

function PathValue({ path }: { path: string }) {
  return (
    <span className="min-w-0 font-mono text-xs font-normal [overflow-wrap:anywhere]" title={path}>
      {path}
    </span>
  );
}

function RevealButton({
  path,
  label = 'В Проводнике',
  inline,
}: {
  path: string;
  label?: string;
  inline?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => reveal(path)}
      title={path}
      className={cn(
        !inline && 'ml-auto',
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-xs font-medium whitespace-nowrap text-[var(--color-text-primary)] transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)] active:scale-[.96]',
        softFill,
        focusRing,
      )}
    >
      <Folder className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.75} />
      {label}
    </button>
  );
}

function Tag({
  children,
  tone,
  mono,
  title,
}: {
  children: React.ReactNode;
  tone?: 'ok' | 'warn';
  mono?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap',
        mono && 'font-mono font-normal',
        tone === 'ok'
          ? 'text-[var(--color-text-primary)]'
          : tone === 'warn'
            ? 'text-[var(--color-warning)]'
            : 'text-[var(--color-text-muted)]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          tone === 'ok'
            ? 'bg-[var(--color-success)] shadow-[0_0_6px_color-mix(in_srgb,var(--color-success)_55%,transparent)]'
            : tone === 'warn'
              ? 'bg-[var(--color-warning)]'
              : 'bg-[var(--color-text-muted)]',
        )}
      />
      {children}
    </span>
  );
}

function Skeleton({ short }: { short?: boolean }) {
  const widths = short ? ['w-40'] : ['w-[62%]', 'w-[44%]', 'w-[70%]'];
  return (
    <span className="flex w-full flex-col gap-2.5" aria-busy="true">
      <span className="sr-only">Загрузка</span>
      {widths.map((w) => (
        <i
          key={w}
          className={cn(
            'block h-3 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)] motion-reduce:animate-none',
            w,
          )}
        />
      ))}
    </span>
  );
}

function SoftChip({ value, unit }: { value: string | number; unit: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full px-[9px] text-[11px] font-medium text-[var(--color-text-muted)] tabular-nums',
        softFill,
      )}
    >
      <b className="mr-1 font-bold text-[var(--color-text-primary)]">{value}</b>
      {unit}
    </span>
  );
}

function Backups({ items }: { items: ConfigBackup[] }) {
  const [openList, setOpenList] = useState(false);
  const latest = items[0];
  if (!latest) {
    return (
      <p className="text-[13px] font-medium text-[var(--color-text-muted)]">
        Копий пока нет. Появятся перед первым переключением, меняющим конфиг.
      </p>
    );
  }
  const total = items.reduce((s, b) => s + b.sizeBytes, 0);
  const [totalValue = '', totalUnit = ''] = formatBytes(total).split(' ');
  const latestIso = stampToIso(latest.createdAt);
  const latestDay = dayLabel(latestIso);
  const folder = latest.backupPath.replace(/[\\/][^\\/]+[\\/][^\\/]+$/, '');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex flex-1 flex-wrap gap-1.5">
          <SoftChip value={items.length} unit={plural(items.length, 'копия', 'копии', 'копий')} />
          <SoftChip value={totalValue} unit={totalUnit} />
          <SoftChip
            value={`${latestDay.lead ?? latestDay.date} ${formatTime(latestIso)}`}
            unit="последняя"
          />
        </span>
        <RevealButton path={folder} label="Папка" inline />
        <button
          type="button"
          onClick={() => setOpenList((v) => !v)}
          aria-expanded={openList}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-3 text-xs font-medium text-[var(--color-text-primary)] transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)] active:scale-[.96]',
            softFill,
            focusRing,
          )}
        >
          {openList ? 'Скрыть' : 'Список'}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform duration-200 ease-[var(--ease-trail)]',
              openList && 'rotate-180',
            )}
            strokeWidth={1.75}
          />
        </button>
      </div>
      {openList && (
        <ul className="flex flex-col gap-1">
          {items.map((b) => {
            const iso = stampToIso(b.createdAt);
            return (
              <li
                key={b.backupPath}
                className="grid h-11 grid-cols-[120px_64px_minmax(0,1fr)_32px] items-center gap-x-3 rounded-full pr-1.5 pl-4 text-[13px] font-medium tabular-nums hover:bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)] @max-[640px]:grid-cols-[110px_60px_minmax(0,1fr)_32px]"
              >
                <span className="text-[var(--color-text-primary)]">
                  {iso ? `${dayLabel(iso).date} · ${formatTime(iso)}` : b.createdAt}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {formatBytes(b.sizeBytes)}
                </span>
                <span
                  className="min-w-0 truncate font-mono text-[11px] font-normal text-[var(--color-text-muted)]"
                  title={b.file}
                >
                  {b.file || fileName(b.backupPath)}
                </span>
                <button
                  type="button"
                  onClick={() => reveal(b.backupPath)}
                  title="В Проводнике"
                  aria-label={`Показать копию ${fileName(b.file)} в Проводнике`}
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full text-[var(--color-text-muted)] transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]',
                    softFill,
                    focusRing,
                  )}
                >
                  <Folder className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
