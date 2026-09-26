import { Bell, Bot, Eye, SquareTerminal } from 'lucide-react';
import { useState } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import type { AgentNotice, NoticeSource } from '@/lib/agent-notice';
import { cn } from '@/lib/cn';

const ICONS: Record<NoticeSource, typeof Bot> = {
  agent: Bot,
  command: SquareTerminal,
  monitor: Eye,
  other: Bell,
};

function dotTone(status: string): string {
  if (status === 'completed') return 'bg-[var(--color-success)]';
  if (status === 'failed') return 'bg-[var(--color-danger)]';
  if (status === 'killed' || status === 'stopped') return 'bg-[var(--color-text-muted)]';
  return 'bg-[var(--color-warning)]';
}

function Summary({ notice }: { notice: AgentNotice }) {
  const quoted = notice.name === null ? '' : `"${notice.name}"`;
  const at = quoted ? notice.summary.indexOf(quoted) : -1;
  if (at === -1) return <>{notice.summary}</>;
  return (
    <>
      {notice.summary.slice(0, at)}
      <b className="font-bold text-[var(--color-text-primary)]">{notice.name}</b>
      {notice.summary.slice(at + quoted.length)}
    </>
  );
}

const more =
  'self-start rounded-full text-xs font-medium text-[var(--color-accent)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';

export function NoticeStep({ notice }: { notice: AgentNotice }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[notice.source];
  const preview = (notice.result ?? '')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .slice(0, 2)
    .join('\n');
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <span className="h-px min-w-6 flex-1 bg-[var(--color-border)]" />
        <span className="inline-flex max-w-[70%] min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)]">
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <Summary notice={notice} />
          </span>
          {notice.status && (
            <span
              title={notice.status}
              className={cn('ml-1 h-2 w-2 shrink-0 rounded-full', dotTone(notice.status))}
            />
          )}
        </span>
        <span className="h-px min-w-6 flex-1 bg-[var(--color-border)]" />
      </div>
      {notice.result && (
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-1">
          {open ? (
            <>
              <div className="max-h-[420px] overflow-auto rounded-2xl bg-[var(--color-bg-primary)] px-4 py-3.5">
                <Markdown body={notice.result} className="feed-md text-[13px]" />
              </div>
              <button type="button" onClick={() => setOpen(false)} className={more}>
                Show less
              </button>
            </>
          ) : (
            <>
              <pre className="m-0 font-mono text-xs leading-normal [overflow-wrap:anywhere] whitespace-pre-wrap text-[var(--color-text-muted)]">
                {preview}
              </pre>
              <button type="button" onClick={() => setOpen(true)} className={more}>
                Show more
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
