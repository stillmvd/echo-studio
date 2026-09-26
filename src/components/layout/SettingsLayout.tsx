import { useQuery } from '@tanstack/react-query';
import { homeDir, join } from '@tauri-apps/api/path';
import {
  ChevronDown,
  Database,
  FileCog,
  Folder,
  type LucideIcon,
  MessageSquare,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useConversationProjects } from '@/hooks/use-conversations';
import { useConfigBackups } from '@/hooks/use-tooling';
import { cn } from '@/lib/cn';
import { revealInExplorer } from '@/lib/ipc';
import { formatBytes } from '@/lib/projects';
import { dayLabel, formatTime } from '@/lib/sessions';
import type { ConfigBackup } from '@/lib/types';
import { version } from '../../../package.json';
import { panelCard } from './panels';
import { EchoMark } from './Titlebar';

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'claude', label: 'Claude config', icon: FileCog },
  { id: 'backups', label: 'Config backups', icon: Database },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
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
  const paths = useQuery({
    queryKey: ['settings', 'paths'],
    queryFn: async () => {
      const home = await homeDir();
      return {
        claudeDir: await join(home, '.claude'),
        userSettings: await join(home, '.claude', 'settings.json'),
        claudeJson: await join(home, '.claude.json'),
        projectsRoot: await join(home, '.claude', 'projects'),
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

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
              aria-label="Settings sections"
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
                id="claude"
                title="Claude config"
                subtitle="Claude Code configuration the Tools tab reads."
              >
                <Rows>
                  <Row label="Config folder">
                    <PathValue path={paths.data?.claudeDir ?? '~/.claude'} />
                    {paths.data && <RevealButton path={paths.data.claudeDir} />}
                  </Row>
                  <Row label="User settings">
                    <PathValue path={paths.data?.userSettings ?? '~/.claude/settings.json'} />
                    {paths.data && <RevealButton path={paths.data.userSettings} />}
                  </Row>
                  <Row label="MCP & projects">
                    <PathValue path={paths.data?.claudeJson ?? '~/.claude.json'} />
                    {paths.data && <RevealButton path={paths.data.claudeJson} />}
                  </Row>
                </Rows>
              </Section>

              <Section
                id="backups"
                title="Config backups"
                subtitle="Copy of a Claude config file before every switch in Tools. Last 20 per file kept."
              >
                {backups.isLoading ? (
                  <Skeleton />
                ) : backups.isError ? (
                  <Tag tone="warn" title={String(backups.error)}>
                    couldn't list copies
                  </Tag>
                ) : (
                  <Backups items={backups.data ?? []} />
                )}
              </Section>

              <Section
                id="conversations"
                title="Conversations"
                subtitle="Claude Code session logs, read-only until you rename or delete a session."
              >
                <Rows>
                  <Row label="Projects root">
                    <PathValue path={paths.data?.projectsRoot ?? '~/.claude/projects'} />
                    {paths.data && <RevealButton path={paths.data.projectsRoot} />}
                  </Row>
                  <Row label="Total">
                    {projects.isLoading ? (
                      <Skeleton short />
                    ) : projects.isError ? (
                      <Tag tone="warn" title={String(projects.error)}>
                        couldn't scan projects
                      </Tag>
                    ) : (
                      <>
                        <Tag tone="ok">{projects.data?.length ?? 0} projects</Tag>
                        <Tag tone="ok">{totalSessions} sessions</Tag>
                        <Tag tone="ok">{formatBytes(totalConvSize)}</Tag>
                      </>
                    )}
                  </Row>
                </Rows>
              </Section>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  label = 'Show in Explorer',
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
      <span className="sr-only">Loading</span>
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
        No copies yet. They appear before the first switch changes a config file.
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
          <SoftChip value={items.length} unit={items.length === 1 ? 'copy' : 'copies'} />
          <SoftChip value={totalValue} unit={totalUnit} />
          <SoftChip
            value={`${latestDay.lead ?? latestDay.date} ${formatTime(latestIso)}`}
            unit="latest"
          />
        </span>
        <RevealButton path={folder} label="Open folder" inline />
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
          {openList ? 'Hide list' : 'Show list'}
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
                  title="Show in Explorer"
                  aria-label={`Show copy of ${fileName(b.file)} in Explorer`}
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
