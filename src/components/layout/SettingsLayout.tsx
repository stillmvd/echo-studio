import { useConversationProjects } from '@/hooks/use-conversations';
import { useMemoriesList } from '@/hooks/use-memories';
import { useDbBackups, useEchovaultConfig } from '@/hooks/use-settings';
import { cn } from '@/lib/cn';
import { revealInExplorer } from '@/lib/ipc';
import type { BackupInfo } from '@/lib/types';
import { version } from '../../../package.json';
import { panelCard } from './panels';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatStamp(stamp: string): string {
  const m = stamp.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return stamp;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
}

export function SettingsLayout() {
  const cfg = useEchovaultConfig();
  const backups = useDbBackups();
  const memories = useMemoriesList({ limit: 1, status: 'all' });
  const projects = useConversationProjects();

  const totalConvSize = (projects.data ?? []).reduce((s, p) => s + p.totalSize, 0);
  const totalSessions = (projects.data ?? []).reduce((s, p) => s + p.sessionCount, 0);

  return (
    <div className={cn(panelCard, 'h-full overflow-y-auto px-6 pt-6 pb-20')}>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
          Settings
        </h1>

        <Section title="EchoVault">
          {cfg.isLoading ? (
            <Loading />
          ) : cfg.isError ? (
            <ErrBlock>{String(cfg.error)}</ErrBlock>
          ) : cfg.data ? (
            <dl className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-2 text-sm">
              <Dt>Memory home</Dt>
              <Dd mono path={cfg.data.memoryHome}>
                {cfg.data.memoryHome}
                <Badge muted className="ml-2">
                  {cfg.data.homeSource}
                </Badge>
              </Dd>

              <Dt>Embedding</Dt>
              <Dd>
                <Badge>{cfg.data.embeddingProvider}</Badge>
                <Badge className="ml-1.5">{cfg.data.embeddingModel}</Badge>
                {cfg.data.ollamaBaseUrl && (
                  <span className="ml-2 font-mono text-[10px] text-[var(--color-text-muted)]">
                    {cfg.data.ollamaBaseUrl}
                  </span>
                )}
              </Dd>

              <Dt>config.yaml</Dt>
              <Dd mono path={cfg.data.configYamlExists ? cfg.data.configYamlPath : undefined}>
                {cfg.data.configYamlPath}
                {!cfg.data.configYamlExists && (
                  <Badge muted className="ml-2">
                    not present (defaults used)
                  </Badge>
                )}
              </Dd>

              <Dt>Memories</Dt>
              <Dd>
                {memories.data ? (
                  <>
                    <span className="text-[var(--color-text-primary)]">{memories.data.total}</span>{' '}
                    total · {memories.data.projects.length} projects ·{' '}
                    {memories.data.categories.length} categories
                  </>
                ) : (
                  '—'
                )}
              </Dd>
            </dl>
          ) : null}
        </Section>

        <Section
          title="Database backups"
          subtitle="Auto-created before every destructive operation. Last 20 kept."
        >
          {backups.isLoading ? (
            <Loading />
          ) : backups.isError ? (
            <ErrBlock>{String(backups.error)}</ErrBlock>
          ) : (backups.data ?? []).length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              No backups yet. They appear after the first archive/delete operation.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-subtle)] rounded-md border border-[var(--color-border-subtle)]">
              {backups.data?.slice(0, 20).map((b) => (
                <BackupRow key={b.path} backup={b} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Conversations">
          {projects.isLoading ? (
            <Loading />
          ) : (
            <dl className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-2 text-sm">
              <Dt>Projects root</Dt>
              <Dd mono>~/.claude/projects/</Dd>
              <Dt>Total</Dt>
              <Dd>
                {projects.data?.length ?? 0} projects · {totalSessions} sessions ·{' '}
                {formatBytes(totalConvSize)}
              </Dd>
            </dl>
          )}
        </Section>

        <Section title="About">
          <dl className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-2 text-sm">
            <Dt>Echo Studio</Dt>
            <Dd>v{version}</Dd>
            <Dt>Stack</Dt>
            <Dd>Tauri 2 + React 19 + Rust</Dd>
            <Dt>EchoVault repo</Dt>
            <Dd mono>github.com/mraza007/echovault</Dd>
          </dl>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
      {children}
    </dt>
  );
}

function Dd({
  children,
  mono,
  path,
}: {
  children: React.ReactNode;
  mono?: boolean;
  path?: string;
}) {
  const base = mono ? 'font-mono text-[12px]' : 'text-sm';
  return (
    <dd className={cn('flex items-center gap-2 text-[var(--color-text-primary)]', base)}>
      <span className="break-all">{children}</span>
      {path && (
        <button
          type="button"
          onClick={() => revealInExplorer(path).catch(() => {})}
          className="ml-auto shrink-0 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:text-[var(--color-text-primary)]"
          title="Reveal in Explorer"
        >
          Reveal
        </button>
      )}
    </dd>
  );
}

function Badge({
  children,
  muted,
  className,
}: {
  children: React.ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px]',
        muted
          ? 'border-[var(--color-border-subtle)] bg-transparent text-[var(--color-text-muted)]'
          : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]',
        className,
      )}
    >
      {children}
    </span>
  );
}

function BackupRow({ backup }: { backup: BackupInfo }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-xs">
      <span className="font-mono text-[var(--color-text-secondary)]">
        {formatStamp(backup.createdAt)}
      </span>
      <span className="text-[var(--color-text-muted)]">{formatBytes(backup.sizeBytes)}</span>
      <span
        className="ml-auto truncate font-mono text-[10px] text-[var(--color-text-muted)]"
        title={backup.path}
      >
        {backup.path}
      </span>
      <button
        type="button"
        onClick={() => revealInExplorer(backup.path).catch(() => {})}
        className="shrink-0 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)] hover:border-[var(--color-border)]"
      >
        Reveal
      </button>
    </li>
  );
}

function Loading() {
  return <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>;
}

function ErrBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="whitespace-pre-wrap rounded-md border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] p-3 text-xs text-[var(--color-danger)]">
      {children}
    </pre>
  );
}
