import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { ArrowLeft, ChevronDown, ChevronRight, Download, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSessionEvents } from '@/hooks/use-session';
import { useDeleteSession } from '@/hooks/use-session-actions';
import { cn } from '@/lib/cn';
import { eventsToMarkdown } from '@/lib/session-export';
import {
  buildFeed,
  type FeedNode,
  isHideableSystemKind,
  nodeText,
  type ToolStep,
} from '@/lib/session-feed';
import { formatDateTime, formatDuration, formatTime, splitTitle } from '@/lib/sessions';
import type { DisplayItem, SessionMeta } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';

interface Props {
  filePath: string;
  title: string;
  session: SessionMeta | null;
  onBack: () => void;
}

const circle =
  'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] outline-none transition-colors duration-200 hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:opacity-50';

function exportFileName(title: string, session: SessionMeta | null): string {
  const safe = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/[\s.]+$/, '')
    .trim();
  return `${safe || session?.sessionId || 'session'}.md`;
}

function useFindHighlight(root: React.RefObject<HTMLElement | null>, query: string, deps: unknown) {
  useEffect(() => {
    void deps;
    if (typeof CSS === 'undefined' || !('highlights' in CSS) || typeof Highlight === 'undefined') {
      return;
    }
    const q = query.trim().toLowerCase();
    const el = root.current;
    CSS.highlights.delete('session-find');
    if (!q || !el) return;
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.toLowerCase() ?? '';
      for (let at = text.indexOf(q); at !== -1; at = text.indexOf(q, at + q.length)) {
        const range = new Range();
        range.setStart(node, at);
        range.setEnd(node, at + q.length);
        ranges.push(range);
      }
    }
    CSS.highlights.set('session-find', new Highlight(...ranges));
    return () => {
      CSS.highlights.delete('session-find');
    };
  }, [root, query, deps]);
}

export function SessionViewer({ filePath, title, session, onBack }: Props) {
  const events = useSessionEvents(filePath);
  const query = useUiStore((s) => s.sessionSearchQuery);
  const setQuery = useUiStore((s) => s.setSessionSearchQuery);
  const showSystem = useUiStore((s) => s.viewerShowSystem);
  const showThinking = useUiStore((s) => s.viewerShowThinking);
  const toggleShowSystem = useUiStore((s) => s.toggleViewerShowSystem);
  const toggleShowThinking = useUiStore((s) => s.toggleViewerShowThinking);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const del = useDeleteSession();
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || confirmDelete) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        e.target.blur();
        return;
      }
      onBack();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirmDelete, onBack]);

  const visible = useMemo(
    () =>
      (events.data ?? []).filter((ev) => {
        if (!showSystem && isHideableSystemKind(ev.kind)) return false;
        if (!showThinking && ev.kind === 'thinking') return false;
        return true;
      }),
    [events.data, showSystem, showThinking],
  );

  const q = query.trim().toLowerCase();
  const allNodes = useMemo(() => buildFeed(visible), [visible]);
  const feed = useMemo(
    () => (q ? allNodes.filter((node) => nodeText(node).includes(q)) : allNodes),
    [allNodes, q],
  );
  useFindHighlight(feedRef, query, feed);

  const onExport = async () => {
    setExportStatus(null);
    if (!events.data) return;
    try {
      const target = await save({
        title: 'Export session as markdown',
        defaultPath: exportFileName(title, session),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!target) return;
      const md = eventsToMarkdown(title, events.data);
      await invoke<void>('write_text_file', { filePath: target, content: md });
      setExportStatus(`Saved to ${target}`);
      setTimeout(() => setExportStatus(null), 2000);
    } catch (e) {
      setExportStatus(`Export failed: ${String(e)}`);
    }
  };

  const [lightTitle, boldTitle] = splitTitle(title);
  const meta = [
    session?.gitBranch,
    session?.firstEventAt && session.lastEventAt
      ? `${formatDateTime(session.firstEventAt)}–${formatTime(session.lastEventAt)}`
      : null,
  ].filter(Boolean);

  return (
    <div className="@container flex h-full flex-col gap-3.5 overflow-hidden px-4 pt-5">
      <header className="flex shrink-0 flex-col gap-3 pr-1 pl-2">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            title="Back to sessions"
            aria-label="Back to sessions"
            className={circle}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="truncate text-[22px] leading-[1.1] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
              {lightTitle}
              <b className="font-bold">{boldTitle}</b>
            </h2>
            <p className="truncate text-xs font-medium text-[var(--color-text-muted)] tabular-nums">
              {session && (
                <span className="font-mono text-[11px]">{session.sessionId.slice(0, 8)}</span>
              )}
              {meta.map((m) => (
                <span key={m}> · {m}</span>
              ))}
              {exportStatus && (
                <span className="text-[var(--color-accent)]"> · {exportStatus}</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex h-10 w-60 items-center gap-2.5 rounded-full bg-[var(--color-bg-primary)] pr-1.5 pl-4 text-[13px] font-medium text-[var(--color-text-muted)] shadow-[inset_0_1px_3px_var(--color-press-shade)] focus-within:ring-2 focus-within:ring-[var(--color-accent)] @max-[640px]:w-40">
              <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find in session"
                aria-label="Find in session"
                className="min-w-0 flex-1 bg-transparent text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
              />
              {q && events.data && (
                <span className="inline-flex h-[26px] shrink-0 items-center rounded-full bg-[var(--color-bg-tertiary)] px-[9px] text-[11px] tabular-nums">
                  {feed.length} of {allNodes.length}
                </span>
              )}
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  title="Clear search"
                  aria-label="Clear search"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--color-bg-tertiary)] outline-none hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={onExport}
              disabled={!events.data || events.data.length === 0}
              title="Export as Markdown"
              aria-label="Export as Markdown"
              className={circle}
            >
              <Download className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={del.isPending}
              title="Delete session"
              aria-label="Delete session"
              className={cn(
                circle,
                'hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]',
              )}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Toggle checked={showThinking} onClick={toggleShowThinking}>
            Thinking
          </Toggle>
          <Toggle checked={showSystem} onClick={toggleShowSystem}>
            System events
          </Toggle>
        </div>
      </header>

      {events.isLoading ? (
        <CenterNote>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-glow-strong)] motion-reduce:animate-none" />
            Loading session…
          </span>
        </CenterNote>
      ) : events.isError ? (
        <CenterNote>
          <span>Couldn't read this session.</span>
          <span className="max-w-[460px] rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 text-left font-mono text-xs break-words text-[var(--color-danger)]">
            {String(events.error)}
          </span>
          <LinkButton onClick={() => void events.refetch()}>Try again</LinkButton>
        </CenterNote>
      ) : feed.length === 0 ? (
        <CenterNote>
          {q ? (
            <>
              <span>No messages match «{query.trim()}».</span>
              <LinkButton onClick={() => setQuery('')}>Clear search</LinkButton>
            </>
          ) : (
            <span>No messages to show.</span>
          )}
        </CenterNote>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[88px]">
          <div ref={feedRef} className="mx-auto flex max-w-[760px] flex-col gap-3.5">
            {feed.map((node) => (
              <FeedRow key={node.key} node={node} showThinking={showThinking} />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        busy={del.isPending}
        title="Delete this session permanently?"
        description="The .jsonl file will be removed from disk. This cannot be undone via this app."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await del.mutateAsync(filePath);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 pb-20 text-center text-[13px] font-medium text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2 text-[var(--color-accent)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full pr-3.5 pl-3 text-xs font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
        checked
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-text-primary)]'
          : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          checked
            ? 'bg-[var(--color-accent)] shadow-[0_0_6px_var(--color-glow-strong)]'
            : 'shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--color-text-muted)_70%,transparent)]',
        )}
      />
      {children}
    </button>
  );
}

function FeedRow({ node, showThinking }: { node: FeedNode; showThinking: boolean }) {
  switch (node.type) {
    case 'message':
      return <MessageCard node={node} showThinking={showThinking} />;
    case 'command':
      return <CommandPill name={node.name} output={node.output} />;
    case 'skill':
      return <SkillChip name={node.name} text={node.text} />;
    case 'tools':
      return <ToolSteps steps={node.steps} />;
    case 'recap':
      return (
        <p className="px-1 text-[13px] leading-normal text-[var(--color-text-muted)] italic">
          {node.text}
        </p>
      );
    case 'image':
      return (
        <p className="px-1 text-xs font-medium text-[var(--color-text-muted)]">
          Image attached · {formatTime(node.item.timestamp)}
        </p>
      );
    case 'system':
      return <SystemRow item={node.item} />;
  }
}

function MessageCard({
  node,
  showThinking,
}: {
  node: Extract<FeedNode, { type: 'message' }>;
  showThinking: boolean;
}) {
  const user = node.item.kind === 'user_text';
  return (
    <article
      className={cn(
        'flex flex-col gap-1.5 rounded-[20px] px-[18px] pt-3.5 pb-4',
        user
          ? 'bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-bg-secondary))]'
          : 'bg-[var(--color-bg-tertiary)]',
      )}
    >
      <header className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)] tabular-nums">
        <span
          className={cn(
            'font-bold',
            user ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]',
          )}
        >
          {user ? 'You' : 'Claude'}
        </span>
        <span>{formatTime(node.item.timestamp)}</span>
        {showThinking && node.thought && (
          <span className="inline-flex h-5 items-center rounded-full bg-[var(--color-bg-secondary)] px-2 text-[11px]">
            thought
          </span>
        )}
      </header>
      {node.text && (
        <Markdown
          body={node.text}
          className="feed-md text-sm leading-[1.55] text-[var(--color-text-primary)] [overflow-wrap:anywhere]"
        />
      )}
      {node.paste !== null && <PastedBlock text={node.paste} />}
      {node.turnMs !== null && (
        <span className="mt-1 text-[11px] font-medium text-[var(--color-text-muted)] tabular-nums">
          turn {formatDuration(node.turnMs)}
        </span>
      )}
    </article>
  );
}

function PastedBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lines = text.split('\n');
  return (
    <div className="mt-1 overflow-hidden rounded-2xl bg-[var(--color-bg-primary)]">
      <div className="flex h-9 items-center gap-2 pr-2 pl-3.5 text-xs font-medium text-[var(--color-text-muted)]">
        <b className="text-[var(--color-text-primary)]">Pasted</b>· {lines.length}{' '}
        {lines.length === 1 ? 'line' : 'lines'}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="ml-auto inline-flex h-[26px] items-center rounded-full bg-[var(--color-bg-tertiary)] px-3 text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          {open ? 'Collapse' : 'Show all'}
        </button>
      </div>
      <pre
        className={cn(
          'px-3.5 pb-3 font-sans text-[13px] leading-normal whitespace-pre-wrap text-[var(--color-text-muted)] [overflow-wrap:anywhere]',
          !open &&
            'max-h-[70px] overflow-hidden [mask-image:linear-gradient(#000_40%,transparent)]',
        )}
      >
        {open ? text : lines.slice(0, 4).join('\n')}
      </pre>
    </div>
  );
}

function CommandPill({ name, output }: { name: string; output: string | null }) {
  return (
    <div className="flex justify-center">
      <span
        title={output ?? undefined}
        className="inline-flex h-[30px] max-w-full items-center gap-2 truncate rounded-full bg-[var(--color-bg-tertiary)] px-3.5 text-xs font-medium text-[var(--color-text-muted)]"
      >
        {name && <b className="font-mono font-normal text-[var(--color-text-primary)]">{name}</b>}
        {name && output && <span>·</span>}
        {output && <span className="truncate">{output.replace(/`/g, '')}</span>}
      </span>
    </div>
  );
}

function SkillChip({ name, text }: { name: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex h-[30px] items-center gap-2 rounded-full bg-[var(--color-bg-tertiary)] pr-2 pl-3 text-xs font-medium text-[var(--color-text-muted)] outline-none hover:bg-[var(--color-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        Skill · <b className="text-[var(--color-text-primary)]">{name}</b>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="w-full rounded-[20px] bg-[var(--color-bg-tertiary)] px-[18px] py-3.5">
          <Markdown body={text} className="feed-md text-[13px]" />
        </div>
      )}
    </div>
  );
}

function ToolSteps({ steps }: { steps: ToolStep[] }) {
  return (
    <div className="relative pl-[22px] before:absolute before:top-2.5 before:bottom-2.5 before:left-[7px] before:w-[1.5px] before:rounded-full before:bg-[var(--color-border)]">
      {steps.map((step) => (
        <ToolStepRow key={step.key} step={step} />
      ))}
    </div>
  );
}

function stepInput(use: DisplayItem | null): string {
  if (!use) return '';
  const json = use.toolInputJson;
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const main = obj.command ?? obj.file_path ?? obj.pattern ?? obj.url;
    if (typeof main === 'string') return main;
    return JSON.stringify(json, null, 2);
  }
  return use.toolInputSummary ?? '';
}

function ToolStepRow({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(false);
  const { use, result } = step;
  const output = result?.text ?? '';
  const error = Boolean(result?.isError);
  return (
    <div
      className={cn(
        'relative flex flex-col gap-1.5 py-1.5 before:absolute before:top-[13px] before:-left-[19px] before:h-[9px] before:w-[9px] before:rounded-full before:bg-[var(--color-bg-secondary)]',
        error
          ? 'before:shadow-[inset_0_0_0_2px_var(--color-danger)]'
          : 'before:shadow-[inset_0_0_0_2px_var(--color-text-muted)]',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-mx-2 flex min-w-0 items-baseline gap-2 rounded-full px-2 py-0.5 text-left text-[13px] font-medium text-[var(--color-text-muted)] outline-none hover:bg-[var(--color-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        <b
          className={cn(
            'shrink-0',
            error ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-primary)]',
          )}
        >
          {use?.toolName ?? 'Result'}
        </b>
        <span className="min-w-0 truncate font-mono text-xs">{use?.toolInputSummary ?? ''}</span>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums">
          {formatTime((use ?? result)?.timestamp ?? null)}
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-1.5">
          {use && <CodeBlock label="Input" text={stepInput(use)} />}
          {result && (
            <CodeBlock label={error ? 'Error' : 'Output'} text={output || '(no output)'} />
          )}
        </div>
      ) : (
        output && (
          <pre
            className={cn(
              'max-h-[3.2em] overflow-hidden rounded-xl bg-[var(--color-bg-primary)] px-2.5 py-1.5 font-mono text-xs leading-normal whitespace-pre-wrap [overflow-wrap:anywhere]',
              error ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]',
            )}
          >
            {output.split('\n').slice(0, 2).join('\n')}
          </pre>
        )
      )}
    </div>
  );
}

function CodeBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="pl-1 text-[11px] font-medium text-[var(--color-text-muted)]">{label}</span>
      <pre className="max-h-[180px] overflow-auto rounded-[14px] bg-[var(--color-bg-primary)] px-3 py-2.5 font-mono text-xs leading-normal whitespace-pre-wrap text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
        {text}
      </pre>
    </div>
  );
}

function SystemRow({ item }: { item: DisplayItem }) {
  return (
    <div className="flex items-center gap-2 px-1 text-[11px] font-medium text-[var(--color-text-muted)]">
      <span className="font-mono">{item.kind}</span>
      <span className="min-w-0 truncate">{item.text || ''}</span>
      {item.timestamp && <span className="ml-auto shrink-0">{formatTime(item.timestamp)}</span>}
    </div>
  );
}
