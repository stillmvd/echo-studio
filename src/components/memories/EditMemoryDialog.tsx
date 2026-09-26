import { ChevronDown, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ConfirmDialog, DialogNote } from '@/components/ui/ConfirmDialog';
import { Field, fieldArea, fieldInput, fieldSurface } from '@/components/ui/Field';
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
      wide
      title="Edit memory"
      description="Changes write to index.db only. Markdown in vault/ stays as-is until next EchoVault CLI reindex."
      busy={update.isPending}
      confirmLabel="Save"
      onConfirm={submit}
      onCancel={cancel}
    >
      <Field label="Title *">
        {(id) => (
          <input
            id={id}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldInput}
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Category">
          {(id) => (
            <span className="relative flex">
              <select
                id={id}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={cn(fieldInput, 'appearance-none pr-10')}
              >
                <option value="">(none)</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute top-1/2 right-4 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]"
                strokeWidth={1.75}
              />
            </span>
          )}
        </Field>
        <Field label="Project · read-only">
          {(id) => (
            <input
              id={id}
              value={data?.project ?? ''}
              readOnly
              className={cn(fieldInput, 'text-[var(--color-text-muted)]')}
            />
          )}
        </Field>
      </div>

      <Field label="Tags">
        {(id) => (
          <div
            className={cn(
              fieldSurface,
              'flex min-h-11 flex-wrap items-center gap-1.5 rounded-[22px] px-3 py-2 focus-within:bg-[var(--color-bg-primary)] focus-within:shadow-[inset_0_0_0_1.5px_var(--color-accent)]',
            )}
          >
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex h-[26px] items-center gap-1 rounded-full bg-[var(--color-bg-secondary)] pr-1.5 pl-2.5 text-xs font-medium text-[var(--color-text-primary)]"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="grid h-4 w-4 place-items-center rounded-full text-[var(--color-text-muted)] outline-none hover:text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  aria-label={`Remove tag ${t}`}
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </span>
            ))}
            <input
              id={id}
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
              placeholder="Add tag, press Enter"
              className="min-w-[120px] flex-1 bg-transparent px-1.5 text-sm font-medium text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
            />
          </div>
        )}
      </Field>

      <Field label="What *">
        {(id) => (
          <textarea
            id={id}
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            rows={3}
            className={fieldArea}
          />
        )}
      </Field>
      <Field label="Why">
        {(id) => (
          <textarea
            id={id}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={3}
            className={fieldArea}
          />
        )}
      </Field>
      <Field label="Impact">
        {(id) => (
          <textarea
            id={id}
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            rows={3}
            className={fieldArea}
          />
        )}
      </Field>
      <Field label="Details · markdown">
        {(id) => (
          <textarea
            id={id}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className={cn(fieldArea, 'font-mono text-xs font-normal')}
          />
        )}
      </Field>

      {status && <DialogNote tone="danger">{status}</DialogNote>}
    </ConfirmDialog>
  );
}
