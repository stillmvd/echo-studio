import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useUpdateMemory } from '@/hooks/use-memory-actions';
import { cn } from '@/lib/cn';
import type { MemoryWithBody } from '@/lib/types';

interface Props {
  open: boolean;
  data: MemoryWithBody | null;
  onClose: () => void;
}

const categories = ['decision', 'pattern', 'bug', 'context', 'learning'] as const;

export function EditMemoryDialog({ open, data, onClose }: Props) {
  const update = useUpdateMemory();

  const [title, setTitle] = useState('');
  const [what, setWhat] = useState('');
  const [why, setWhy] = useState('');
  const [impact, setImpact] = useState('');
  const [category, setCategory] = useState<string>('');
  const [tagsInput, setTagsInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (open && data) {
      setTitle(data.title);
      setWhat(data.what);
      setWhy(data.why ?? '');
      setImpact(data.impact ?? '');
      setCategory(data.category ?? '');
      setTags([...data.tags]);
      setTagsInput('');
      setBody(data.body ?? '');
      setStatus(null);
    }
  }, [open, data]);

  const addTag = () => {
    const value = tagsInput.trim().replace(/^#/, '');
    if (!value) return;
    if (!tags.includes(value)) setTags([...tags, value]);
    setTagsInput('');
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const submit = async () => {
    if (!data) return;
    if (!title.trim() || !what.trim()) {
      setStatus('Title and What are required.');
      return;
    }
    setStatus(null);
    const patch = {
      title: title.trim(),
      what: what.trim(),
      why: why.trim() ? why.trim() : null,
      impact: impact.trim() ? impact.trim() : null,
      category: category || null,
      tags,
      body: body.trim() ? body : null,
    };
    try {
      await update.mutateAsync({ id: data.id, patch });
      onClose();
    } catch (e) {
      setStatus(`Update failed: ${String(e)}`);
    }
  };

  const dirty =
    !!data &&
    (title !== data.title ||
      what !== data.what ||
      why !== (data.why ?? '') ||
      impact !== (data.impact ?? '') ||
      category !== (data.category ?? '') ||
      body !== (data.body ?? '') ||
      tagsInput.trim() !== '' ||
      tags.join('\n') !== data.tags.join('\n'));

  const cancel = () => {
    if (!dirty || window.confirm('Discard unsaved changes?')) onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title="Edit memory"
      description="Changes write to index.db only. Markdown in vault/ stays as-is until next EchoVault CLI reindex."
      busy={update.isPending}
      confirmLabel="Save"
      onConfirm={submit}
      onCancel={cancel}
    >
      <div className="flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
        <Field label="Title *">
          <Input value={title} onChange={setTitle} />
        </Field>

        <div className="flex gap-2">
          <Field label="Category" className="flex-1">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-8 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="">(none)</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Project (read-only)" className="flex-1">
            <Input value={data?.project ?? ''} onChange={() => {}} disabled />
          </Field>
        </div>

        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 py-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[10px] text-[var(--color-text-secondary)]"
              >
                #{t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  aria-label={`remove ${t}`}
                >
                  ✕
                </button>
              </span>
            ))}
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag();
                }
                if (e.key === 'Backspace' && !tagsInput && tags.length > 0) {
                  setTags(tags.slice(0, -1));
                }
              }}
              onBlur={addTag}
              placeholder="add tag, press Enter"
              className="min-w-[120px] flex-1 bg-transparent text-xs text-[var(--color-text-primary)] focus:outline-none"
            />
          </div>
        </Field>

        <Field label="What *">
          <Textarea value={what} onChange={setWhat} rows={3} />
        </Field>
        <Field label="Why">
          <Textarea value={why} onChange={setWhy} rows={3} />
        </Field>
        <Field label="Impact">
          <Textarea value={impact} onChange={setImpact} rows={3} />
        </Field>
        <Field label="Details (markdown body)">
          <Textarea value={body} onChange={setBody} rows={8} mono />
        </Field>

        {status && (
          <div className="rounded-sm border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-2 py-1 text-[11px] text-[var(--color-danger)]">
            {status}
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'h-8 w-full rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none',
        disabled && 'opacity-60',
      )}
    />
  );
}

function Textarea({
  value,
  onChange,
  rows,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: number;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={cn(
        'w-full resize-y rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none',
        mono && 'font-mono text-[11px] leading-snug',
      )}
    />
  );
}
