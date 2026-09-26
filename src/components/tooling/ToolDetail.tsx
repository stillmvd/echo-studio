import { CircleAlert, Folder, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import { useToolCopies, useToolFile } from '@/hooks/use-tooling';
import { cn } from '@/lib/cn';
import { revealInExplorer } from '@/lib/ipc';
import { formatShortDateTime } from '@/lib/projects';
import { copiesFor, copyHash } from '@/lib/tooling';
import type { ToolItem } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';
import { McpDetail } from './McpDetail';
import { PluginDetail } from './PluginDetail';
import { DetailToggle } from './ToolToggle';

const KIND_LABEL: Record<ToolItem['kind'], string> = {
  skill: 'Skill',
  command: 'Command',
  agent: 'Agent',
  plugin: 'Plugin',
  mcp: 'MCP server',
};

const soft = 'bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]';
const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-0';

function reveal(path: string | null) {
  if (path) revealInExplorer(path).catch(() => {});
}

function splitName(name: string): [string, string] {
  const m = name.match(/^(.*[\s:-])([^\s:-]+)$/);
  return m ? [m[1] ?? '', m[2] ?? ''] : ['', name];
}

function stripFrontMatter(text: string): string {
  return text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function source(item: ToolItem): string {
  if (item.mcp) return item.mcp.declaredIn;
  if (item.origin === 'user') return '~/.claude';
  if (item.origin === 'plugin') return item.pluginKey ?? 'plugin';
  return item.origin;
}

function Chip({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const cls = cn(
    'inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap',
    soft,
  );
  if (!onClick) {
    return (
      <span title={title} className={cn(cls, 'min-w-0 truncate')}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(cls, 'pl-2.5 hover:bg-[var(--color-hover)] active:scale-[.96]', focusRing)}
    >
      {children}
    </button>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 pb-20 text-center text-[13px] font-medium text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2 text-[13px] font-medium text-[var(--color-accent)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      {children}
    </button>
  );
}

function ErrorPlate({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 font-mono text-xs leading-normal [overflow-wrap:anywhere] text-[var(--color-danger)]">
      <CircleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0">{text}</span>
    </div>
  );
}

function FileText({ path, itemError }: { path: string; itemError: string | null }) {
  const file = useToolFile(path);
  if (file.isLoading) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--color-text-muted)]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)] motion-reduce:animate-none" />
        Reading file…
      </span>
    );
  }
  if (file.isError) {
    return (
      <div className="flex flex-col items-start gap-2.5">
        <ErrorPlate text={String(file.error)} />
        <LinkButton onClick={() => void file.refetch()}>Try again</LinkButton>
      </div>
    );
  }
  const text = file.data?.text ?? '';
  return (
    <>
      {itemError && <ErrorPlate text={itemError} />}
      <Markdown body={itemError ? text : stripFrontMatter(text)} className="tool-md" />
      {file.data?.truncatedAt != null && (
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          The file is large — the first {Math.round(file.data.truncatedAt / 1024)} KB are shown.
        </span>
      )}
    </>
  );
}

function AlsoFoundIn({ item, scopePath }: { item: ToolItem; scopePath: string | null }) {
  const copies = useToolCopies().data;
  const [all, setAll] = useState(false);
  if (!copies) return null;
  const list = copiesFor(item, copies, scopePath);
  if (list.length === 0) return null;
  const own = copyHash(item, copies);
  const shown = all ? list : list.slice(0, 6);
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="py-1 text-xs font-medium text-[var(--color-text-muted)]">
        Also found in <b className="font-bold text-[var(--color-text-primary)]">{list.length}</b>
      </h3>
      {shown.map((c) => {
        const same = own !== null && c.hash === own;
        return (
          <div key={c.filePath} className="flex h-[34px] items-center gap-2 px-1">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-medium text-[var(--color-text-primary)]">
              <Folder
                className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
                strokeWidth={1.75}
              />
              <span className="truncate" title={c.filePath}>
                {c.scope.label}
              </span>
            </span>
            <span
              className={cn(
                'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium',
                c.hash === null
                  ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
                  : same
                    ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
                    : 'bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)]',
              )}
            >
              {c.hash === null ? 'Unreadable' : same ? 'Same' : 'Differs'}
            </span>
            {!same && c.hash !== null && c.modifiedMs !== null && (
              <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-muted)]">
                {formatShortDateTime(new Date(c.modifiedMs).toISOString())}
              </span>
            )}
            <button
              type="button"
              onClick={() => reveal(c.filePath)}
              className={cn(
                'shrink-0 rounded-full px-1 text-[11px] font-medium whitespace-nowrap text-[var(--color-accent)] hover:underline',
                focusRing,
              )}
            >
              Show in folder
            </button>
          </div>
        );
      })}
      {list.length > 6 && !all && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className={cn(
            'self-start rounded-full px-1 text-[11px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
            focusRing,
          )}
        >
          and {list.length - 6} more
        </button>
      )}
    </section>
  );
}

export function ToolDetail({
  item,
  removed,
  items,
  scopePath,
  onClose,
}: {
  item: ToolItem;
  removed: boolean;
  items: ToolItem[];
  scopePath: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('input, textarea, [role="dialog"]'))
        return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleError = useUiStore((s) =>
    s.toolToggleError?.id === item.id ? s.toolToggleError.message : null,
  );
  const name = item.kind === 'plugin' ? item.name : item.qualifiedName;
  const [light, bold] = splitName(name);
  const meta = [
    KIND_LABEL[item.kind],
    item.origin,
    item.state === 'disabled' ? 'off' : null,
    item.state === 'unavailable' ? 'plugin off' : null,
    item.pluginKey && item.kind !== 'plugin' ? item.pluginKey : null,
  ].filter(Boolean);
  const description = item.kind === 'mcp' ? null : item.description;
  const isMarkdown = item.kind === 'skill' || item.kind === 'command' || item.kind === 'agent';
  const members =
    item.kind === 'plugin'
      ? items.filter((i) => i.pluginKey === item.pluginKey && i.kind !== 'plugin')
      : [];

  return (
    <div className="@container flex h-full flex-col gap-3.5 overflow-hidden px-4 pt-5">
      <div className="flex items-start gap-3 px-1">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-[28px] leading-[1.06] font-light tracking-[-0.02em] [overflow-wrap:anywhere] text-[var(--color-text-primary)]">
            {light}
            <b className="font-bold">{bold}</b>
          </h2>
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            {meta.join(' · ')}
          </span>
          {description && (
            <p className="line-clamp-3 text-[13px] leading-normal font-medium text-[var(--color-text-muted)]">
              {description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!removed && <DetailToggle item={item} />}
          {item.filePath && !removed && (
            <button
              type="button"
              title="Show in Explorer"
              onClick={() => reveal(item.plugin?.installPath ?? item.filePath)}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 rounded-full pr-3 pl-2.5 text-xs font-medium whitespace-nowrap hover:bg-[var(--color-hover)] active:scale-[.96] @max-[600px]:w-8 @max-[600px]:px-0 @max-[420px]:hidden',
                soft,
                focusRing,
              )}
            >
              <Folder className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.75} />
              <span className="@max-[600px]:sr-only">Show in Explorer</span>
            </button>
          )}
          <button
            type="button"
            aria-label="Close details"
            title="Close (Esc)"
            onClick={onClose}
            className={cn(
              'grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--color-hover)]',
              soft,
              focusRing,
            )}
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {removed ? (
        <Note>
          <span>
            {name} is no longer in {source(item)}.
          </span>
          <LinkButton onClick={onClose}>Back to list</LinkButton>
        </Note>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 pb-[88px]">
          {toggleError && <ErrorPlate text={toggleError} />}
          <div className="flex flex-wrap gap-1.5">
            {item.filePath && (
              <Chip title={item.filePath} onClick={() => reveal(item.filePath)}>
                <Folder
                  className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
                  strokeWidth={1.75}
                />
                {fileName(item.filePath)}
              </Chip>
            )}
            <Chip title={source(item)}>{source(item)}</Chip>
          </div>
          {isMarkdown && <AlsoFoundIn item={item} scopePath={scopePath} />}
          {isMarkdown && item.filePath && (
            <FileText key={item.filePath} path={item.filePath} itemError={item.error} />
          )}
          {item.mcp && <McpDetail mcp={item.mcp} />}
          {item.kind === 'plugin' && item.error && <ErrorPlate text={item.error} />}
          {item.kind === 'plugin' && <PluginDetail item={item} members={members} />}
        </div>
      )}
    </div>
  );
}
