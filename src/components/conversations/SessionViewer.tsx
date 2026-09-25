import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useState } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSessionEvents } from '@/hooks/use-session';
import { useDeleteSession } from '@/hooks/use-session-actions';
import { cn } from '@/lib/cn';
import { eventsToMarkdown } from '@/lib/session-export';
import type { DisplayItem } from '@/lib/types';
import { useUiStore } from '@/state/ui-store';

interface Props {
  filePath: string;
  sessionId: string;
  onBack: () => void;
}

function isSystemKind(kind: string) {
  return kind.startsWith('system_') || kind.startsWith('meta_');
}

function timeOnly(ts: string | null) {
  if (!ts) return '';
  const idx = ts.indexOf('T');
  if (idx === -1) return ts;
  return ts.slice(idx + 1, idx + 9);
}

export function SessionViewer({ filePath, sessionId, onBack }: Props) {
  const events = useSessionEvents(filePath);
  const sessionSearchQuery = useUiStore((s) => s.sessionSearchQuery);
  const setSessionSearchQuery = useUiStore((s) => s.setSessionSearchQuery);
  const showSystem = useUiStore((s) => s.viewerShowSystem);
  const showThinking = useUiStore((s) => s.viewerShowThinking);
  const toggleShowSystem = useUiStore((s) => s.toggleViewerShowSystem);
  const toggleShowThinking = useUiStore((s) => s.toggleViewerShowThinking);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const del = useDeleteSession();

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

  const filtered = useMemo(() => {
    const data = events.data ?? [];
    const q = sessionSearchQuery.trim().toLowerCase();
    return data.filter((ev) => {
      if (!showSystem && isSystemKind(ev.kind)) return false;
      if (!showThinking && ev.kind === 'thinking') return false;
      if (!q) return true;
      const haystack = (
        (ev.text ?? '') +
        ' ' +
        (ev.toolInputSummary ?? '') +
        ' ' +
        (ev.toolName ?? '') +
        ' ' +
        ev.kind
      ).toLowerCase();
      return haystack.includes(q);
    });
  }, [events.data, sessionSearchQuery, showSystem, showThinking]);

  const onExport = async () => {
    setExportStatus(null);
    if (!events.data) return;
    try {
      const target = await save({
        title: 'Export session as markdown',
        defaultPath: `${sessionId}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!target) return;
      const md = eventsToMarkdown(sessionId, events.data);
      await invoke<void>('write_text_file', { filePath: target, content: md });
      setExportStatus(`Saved to ${target}`);
      setTimeout(() => setExportStatus(null), 2000);
    } catch (e) {
      setExportStatus(`Export failed: ${String(e)}`);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-border)]"
          >
            ← Back
          </button>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[11px] text-[var(--color-text-primary)]">
              {sessionId}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {events.data ? `${filtered.length} of ${events.data.length} items` : 'Loading…'}
              {exportStatus && (
                <span className="ml-2 text-[var(--color-accent)]">· {exportStatus}</span>
              )}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input
              value={sessionSearchQuery}
              onChange={(e) => setSessionSearchQuery(e.target.value)}
              placeholder="Filter messages…"
              className="h-8 w-72 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-3 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            <button
              type="button"
              onClick={onExport}
              disabled={!events.data || events.data.length === 0}
              className="rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-border)] disabled:opacity-50"
              title="Export session as markdown"
            >
              Export ↓
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={del.isPending}
              className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/15 px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25 disabled:opacity-50"
              title="Delete session file"
            >
              Delete
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <ToggleChip checked={showThinking} onClick={toggleShowThinking}>
            Thinking
          </ToggleChip>
          <ToggleChip checked={showSystem} onClick={toggleShowSystem}>
            System events
          </ToggleChip>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-20">
        {events.isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading session…</p>
        ) : events.isError ? (
          <pre className="rounded-md border border-[var(--color-danger)] p-3 text-xs text-[var(--color-danger)]">
            {String(events.error)}
          </pre>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-sm text-[var(--color-text-muted)]">No messages match.</p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {filtered.map((ev) => (
              <DisplayRow key={ev.uuid} item={ev} />
            ))}
          </div>
        )}
      </div>

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

function ToggleChip({
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
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 transition-colors',
        checked
          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:border-[var(--color-border)]',
      )}
    >
      {checked ? '✓' : '○'} Show {children}
    </button>
  );
}

function DisplayRow({ item }: { item: DisplayItem }) {
  switch (item.kind) {
    case 'user_text':
      return <UserMessage item={item} />;
    case 'assistant_text':
      return <AssistantMessage item={item} />;
    case 'thinking':
      return <ThinkingMessage item={item} />;
    case 'tool_use':
      return <ToolUseRow item={item} />;
    case 'tool_result':
      return <ToolResultRow item={item} />;
    case 'image':
      return <ImagePlaceholder item={item} />;
    default:
      return <SystemRow item={item} />;
  }
}

function MessageHeader({
  label,
  ts,
  className,
}: {
  label: string;
  ts: string | null;
  className?: string;
}) {
  return (
    <div className={cn('mb-1 flex items-baseline gap-2 text-[10px] uppercase', className)}>
      <span className="font-medium tracking-wider">{label}</span>
      {ts && <span className="text-[var(--color-text-muted)]">{timeOnly(ts)}</span>}
    </div>
  );
}

function UserMessage({ item }: { item: DisplayItem }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-4 py-3">
      <MessageHeader label="You" ts={item.timestamp} className="text-[var(--color-accent)]" />
      <div className="text-sm text-[var(--color-text-primary)]">
        <Markdown body={item.text ?? ''} />
      </div>
    </div>
  );
}

function AssistantMessage({ item }: { item: DisplayItem }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)]/40 px-4 py-3">
      <MessageHeader
        label="Claude"
        ts={item.timestamp}
        className="text-[var(--color-text-primary)]"
      />
      <div className="text-sm text-[var(--color-text-primary)]">
        <Markdown body={item.text ?? ''} />
      </div>
    </div>
  );
}

function ThinkingMessage({ item }: { item: DisplayItem }) {
  const text = (item.text ?? '').trim();
  const sealed = text.length === 0;
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-border-subtle)] bg-transparent px-4 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]"
      title={
        sealed
          ? 'Anthropic encrypts the contents of thinking blocks (extended thinking signature). Only the marker that Claude paused to reason is preserved.'
          : undefined
      }
    >
      <span>💭 Thinking</span>
      {item.timestamp && <span>{timeOnly(item.timestamp)}</span>}
      <span className="ml-auto italic normal-case tracking-normal opacity-70">
        {sealed ? 'sealed by Anthropic — content not accessible' : `${text.length} chars`}
      </span>
    </div>
  );
}

function ToolUseRow({ item }: { item: DisplayItem }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="flex flex-col gap-1 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-3 py-2 text-left transition-colors hover:border-[var(--color-warning)]/50"
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-mono uppercase text-[var(--color-warning)]">
          → {item.toolName ?? '?'}
        </span>
        <span className="flex-1 truncate font-mono text-[var(--color-text-secondary)]">
          {item.toolInputSummary || ''}
        </span>
        {item.timestamp && (
          <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">
            {timeOnly(item.timestamp)}
          </span>
        )}
      </div>
      {open && (
        <pre className="mt-1 max-h-64 overflow-auto rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] p-2 font-mono text-[10px] text-[var(--color-text-secondary)]">
          {JSON.stringify(item.toolInputJson, null, 2)}
        </pre>
      )}
    </button>
  );
}

function ToolResultRow({ item }: { item: DisplayItem }) {
  const [open, setOpen] = useState(false);
  const text = item.text ?? '';
  const lines = text.split('\n');
  const lineCount = lines.length;
  const previewLines = lines.slice(0, 2).join('\n');
  const truncated = text.length > 200 || lineCount > 2;
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className={cn(
        'flex flex-col gap-1 rounded-md border bg-[var(--color-bg-secondary)] px-3 py-2 text-left transition-colors',
        item.isError
          ? 'border-[var(--color-danger)]/40 hover:border-[var(--color-danger)]/70'
          : 'border-[var(--color-border-subtle)] hover:border-[var(--color-success)]/50',
      )}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
        <span
          className={cn(
            item.isError ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]',
          )}
        >
          ← {item.isError ? 'tool error' : 'tool result'}
        </span>
        <span className="text-[var(--color-text-muted)]">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'} · {text.length} chars
        </span>
        <span className="ml-auto">{truncated ? (open ? '▼' : '▶') : ''}</span>
      </div>
      <pre
        className={cn(
          'whitespace-pre-wrap font-mono text-[11px] text-[var(--color-text-secondary)]',
          !open && 'line-clamp-2',
        )}
      >
        {open ? text : previewLines}
      </pre>
    </button>
  );
}

function ImagePlaceholder({ item }: { item: DisplayItem }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--color-border-subtle)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
      🖼 [image attached] {item.timestamp && `· ${timeOnly(item.timestamp)}`}
    </div>
  );
}

function SystemRow({ item }: { item: DisplayItem }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[10px] text-[var(--color-text-muted)]">
      <span className="font-mono">{item.kind}</span>
      <span className="truncate">{item.text || ''}</span>
      {item.timestamp && <span className="ml-auto">{timeOnly(item.timestamp)}</span>}
    </div>
  );
}
