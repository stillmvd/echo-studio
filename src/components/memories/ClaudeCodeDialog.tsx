import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { buildPrompt, type ClaudeTemplate, TEMPLATE_LABELS } from '@/lib/claude-templates';
import { cn } from '@/lib/cn';
import { openInClaudeCode } from '@/lib/ipc';
import type { Memory, MemoryWithBody } from '@/lib/types';

interface Props {
  open: boolean;
  initialTemplate: ClaudeTemplate;
  memory: Memory | MemoryWithBody | null;
  defaultProject: string | null;
  defaultCwd: string;
  onClose: () => void;
}

const templates: ClaudeTemplate[] = ['save', 'update', 'investigate'];

export function ClaudeCodeDialog({
  open,
  initialTemplate,
  memory,
  defaultProject,
  defaultCwd,
  onClose,
}: Props) {
  const [template, setTemplate] = useState<ClaudeTemplate>(initialTemplate);
  const [topic, setTopic] = useState('');
  const [cwd, setCwd] = useState(defaultCwd);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTemplate(initialTemplate);
      setTopic('');
      setCwd(defaultCwd);
      setStatus(null);
    }
  }, [open, initialTemplate, defaultCwd]);

  const baseline = useMemo(
    () => buildPrompt(template, { project: defaultProject, memory, topic }),
    [template, defaultProject, memory, topic],
  );

  useEffect(() => {
    setPrompt(baseline);
  }, [baseline]);

  const launch = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await navigator.clipboard.writeText(prompt);
      const usedCwd = await openInClaudeCode(cwd.trim() || undefined);
      setStatus(
        `Opened terminal in ${usedCwd}. Prompt copied — paste in Claude with Ctrl+Shift+V.`,
      );
      setTimeout(() => onClose(), 1200);
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      title="Open in Claude Code"
      busy={busy}
      confirmLabel="Launch"
      onConfirm={launch}
      onCancel={onClose}
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-1 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] p-0.5">
          {templates.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTemplate(t)}
              disabled={t === 'update' && !memory}
              className={cn(
                'flex-1 rounded-sm px-2 py-1 text-xs transition-colors',
                t === template
                  ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                t === 'update' && !memory && 'cursor-not-allowed opacity-40',
              )}
            >
              {TEMPLATE_LABELS[t]}
            </button>
          ))}
        </div>

        <FormField label={template === 'investigate' ? 'Question' : 'Topic / changes'}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="(short summary)"
            className="h-8 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </FormField>

        <FormField label="Working directory (cwd for `claude`)">
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            spellCheck={false}
            className="h-8 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 font-mono text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </FormField>

        <FormField label="Prompt (editable, copied to clipboard on launch)">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={9}
            className="w-full resize-y rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 font-mono text-[11px] leading-snug text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </FormField>

        {status && (
          <div className="rounded-sm border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-2 py-1 text-[11px] text-[var(--color-accent)]">
            {status}
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}
