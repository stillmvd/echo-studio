import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, DialogNote } from '@/components/ui/ConfirmDialog';
import { Field, fieldArea, fieldInput } from '@/components/ui/Field';
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

const TEMPLATE_HINTS: Record<ClaudeTemplate, string> = {
  save: 'New memory from this session',
  update: 'Rewrite the selected memory',
  investigate: 'Ask Claude to dig into a question',
};

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
      wide
      title="Open in Claude Code"
      description="Opens Windows Terminal in the folder and copies the prompt. Paste it in Claude with Ctrl+Shift+V."
      busy={busy}
      confirmLabel="Launch"
      onConfirm={launch}
      onCancel={onClose}
    >
      <fieldset aria-label="Template" className="grid min-w-0 grid-cols-3 gap-2">
        {templates.map((t) => {
          const disabled = t === 'update' && !memory;
          return (
            <button
              type="button"
              key={t}
              aria-pressed={t === template}
              onClick={() => setTemplate(t)}
              disabled={disabled}
              className={cn(
                'flex flex-col items-start gap-1 rounded-[20px] bg-[var(--color-bg-tertiary)] px-3.5 py-3 text-left outline-none transition-[box-shadow,background-color] duration-200 ease-[var(--ease-trail)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-secondary)]',
                t === template
                  ? 'shadow-[inset_0_0_0_2px_var(--color-accent)]'
                  : 'hover:bg-[var(--color-hover)]',
                disabled && 'cursor-not-allowed opacity-40',
              )}
            >
              <span className="text-[13px] font-bold text-[var(--color-text-primary)]">
                {TEMPLATE_LABELS[t]}
              </span>
              <span className="text-xs leading-snug font-medium text-[var(--color-text-muted)]">
                {TEMPLATE_HINTS[t]}
              </span>
            </button>
          );
        })}
      </fieldset>

      <Field label={template === 'investigate' ? 'Question' : 'Topic'}>
        {(id) => (
          <input
            id={id}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Short summary"
            className={fieldInput}
          />
        )}
      </Field>

      <Field label="Working directory">
        {(id) => (
          <input
            id={id}
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            spellCheck={false}
            className={cn(fieldInput, 'font-mono text-xs font-normal')}
          />
        )}
      </Field>

      <Field label="Prompt · copied on launch">
        {(id) => (
          <textarea
            id={id}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={9}
            className={cn(fieldArea, 'font-mono text-xs font-normal')}
          />
        )}
      </Field>

      {status && (
        <DialogNote tone={status.startsWith('Failed') ? 'danger' : 'accent'}>{status}</DialogNote>
      )}
    </ConfirmDialog>
  );
}
