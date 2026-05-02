import { Markdown } from '@/components/markdown/Markdown';
import { cn } from '@/lib/cn';
import type { MemoryWithBody } from '@/lib/types';
import { type DetailMode, useUiStore } from '@/state/ui-store';

interface Props {
  data: MemoryWithBody;
}

const modes: { value: DetailMode; label: string }[] = [
  { value: 'rendered', label: 'Rendered' },
  { value: 'raw', label: 'Raw' },
];

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function MemoryDetail({ data }: Props) {
  const detailMode = useUiStore((s) => s.detailMode);
  const setDetailMode = useUiStore((s) => s.setDetailMode);

  const m = data;

  return (
    <article className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-2 border-b border-[var(--color-border-subtle)] px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-lg font-semibold leading-snug text-[var(--color-text-primary)]">
            {m.title}
          </h1>
          <ModeToggle current={detailMode} onChange={setDetailMode} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-text-muted)]">
          <Badge>{m.project}</Badge>
          {m.category && <Badge>{m.category}</Badge>}
          <Badge muted>status: {m.status}</Badge>
          <span>·</span>
          <span>created {m.createdAt.slice(0, 10)}</span>
          <span>·</span>
          <span>updated {m.updatedAt.slice(0, 10)}</span>
          {m.updatedCount > 0 && (
            <>
              <span>·</span>
              <span>×{m.updatedCount}</span>
            </>
          )}
          {m.body && (
            <>
              <span>·</span>
              <span>{formatBytes(m.sizeBytes)}</span>
            </>
          )}
        </div>
        {m.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {m.tags.map((t) => (
              <Badge key={t} kind="tag">
                #{t}
              </Badge>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <Section label="What">
          <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{m.what}</p>
        </Section>

        {m.why && (
          <Section label="Why">
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
              {m.why}
            </p>
          </Section>
        )}

        {m.impact && (
          <Section label="Impact">
            <p className="whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
              {m.impact}
            </p>
          </Section>
        )}

        {m.relatedFiles.length > 0 && (
          <Section label="Related files">
            <ul className="space-y-1 text-xs">
              {m.relatedFiles.map((f) => (
                <li
                  key={f}
                  className="truncate font-mono text-[var(--color-text-secondary)]"
                  title={f}
                >
                  {f}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {m.body !== null && m.body !== undefined && m.body !== '' && (
          <Section label="Details">
            {detailMode === 'rendered' ? (
              <Markdown body={m.body} />
            ) : (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-3 font-mono text-xs text-[var(--color-text-secondary)]">
                {m.body}
              </pre>
            )}
          </Section>
        )}

        <footer className="mt-8 flex flex-wrap items-center gap-2 border-t border-[var(--color-border-subtle)] pt-4 text-xs text-[var(--color-text-muted)]">
          <ActionButton disabled title="Edit (Phase 5)">
            Edit
          </ActionButton>
          <ActionButton disabled title="Archive (Phase 4)">
            Archive
          </ActionButton>
          <ActionButton disabled title="Delete (Phase 4)">
            Delete
          </ActionButton>
          <ActionButton disabled title="Open in Claude Code (Phase 5)">
            Open in Claude Code
          </ActionButton>
          <span className="ml-auto font-mono">{m.id}</span>
        </footer>
      </div>
    </article>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </h2>
      {children}
    </section>
  );
}

function Badge({
  children,
  muted,
  kind,
}: {
  children: React.ReactNode;
  muted?: boolean;
  kind?: 'tag';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px]',
        kind === 'tag'
          ? 'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]'
          : muted
            ? 'border-[var(--color-border-subtle)] bg-transparent text-[var(--color-text-muted)]'
            : 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]',
      )}
    >
      {children}
    </span>
  );
}

function ActionButton({
  children,
  disabled,
  title,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      className={cn(
        'rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-3 py-1 text-xs',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)]',
      )}
    >
      {children}
    </button>
  );
}

function ModeToggle({
  current,
  onChange,
}: {
  current: DetailMode;
  onChange: (m: DetailMode) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] p-0.5">
      {modes.map((m) => (
        <button
          type="button"
          key={m.value}
          onClick={() => onChange(m.value)}
          className={cn(
            'rounded-sm px-2 py-0.5 text-xs transition-colors',
            current === m.value
              ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
