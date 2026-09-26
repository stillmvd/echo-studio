import { Check, Copy, Eye } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { McpInfo } from '@/lib/types';

function quote(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function Secrets({ values }: { values: Record<string, string> }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  return (
    <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1.5 text-xs">
      {Object.entries(values).map(([k, v]) => {
        const shown = open.has(k);
        return (
          <div key={k} className="contents">
            <span className="font-mono text-[var(--color-text-muted)]">{k}</span>
            <button
              type="button"
              title={shown ? undefined : 'Show value'}
              onClick={() => setOpen((s) => new Set(s).add(k))}
              className={cn(
                'inline-flex h-[26px] max-w-full items-center gap-2 justify-self-start rounded-full bg-[var(--color-bg-primary)] px-2.5 font-mono outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
                shown
                  ? 'cursor-text text-[var(--color-text-primary)] select-text'
                  : 'tracking-[.12em] text-[var(--color-text-muted)]',
              )}
            >
              <span className="truncate">{shown ? v : '••••••••••••'}</span>
              {!shown && <Eye className="h-3 w-3 shrink-0" strokeWidth={1.75} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
      <dt className="text-[13px] font-medium text-[var(--color-text-muted)]">{label}</dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
        {children}
      </dd>
    </div>
  );
}

export function McpDetail({ mcp }: { mcp: McpInfo }) {
  const [copied, setCopied] = useState(false);
  const line = mcp.url ?? [mcp.command ?? '', ...mcp.args.map(quote)].join(' ');
  const env = Object.keys(mcp.env).length > 0;
  const headers = Object.keys(mcp.headers).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2.5 rounded-2xl bg-[var(--color-bg-primary)] py-2 pr-2 pl-4 shadow-[inset_0_1px_3px_var(--color-press-shade)]">
        <code className="min-w-0 flex-1 py-1.5 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] text-[var(--color-text-primary)]">
          {!mcp.url && <span className="text-[var(--color-text-muted)]">$ </span>}
          {line}
        </code>
        <button
          type="button"
          aria-label="Copy command"
          title="Copy"
          onClick={() => {
            navigator.clipboard
              .writeText(line)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => {});
          }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] text-[var(--color-text-primary)] outline-none hover:bg-[var(--color-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          {copied ? (
            <Check className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <Copy className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </div>
      <dl className="m-0 flex flex-col gap-2.5">
        <Row label="Transport">
          <span className="inline-flex h-6 items-center rounded-full bg-[var(--color-bg-tertiary)] px-[9px] text-[11px] font-medium text-[var(--color-text-muted)]">
            {mcp.transport}
          </span>
        </Row>
        <Row label="Environment">
          {env ? (
            <Secrets values={mcp.env} />
          ) : (
            <span className="text-[13px] text-[var(--color-text-muted)]">
              No environment variables
            </span>
          )}
        </Row>
        {headers && (
          <Row label="Headers">
            <Secrets values={mcp.headers} />
          </Row>
        )}
      </dl>
    </div>
  );
}
