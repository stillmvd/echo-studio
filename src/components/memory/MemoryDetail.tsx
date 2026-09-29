import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  useArchiveMemoryRecord,
  useMemoryFile,
  useMoveMemoryRecord,
  usePatchMemoryRecord,
  useRestoreMemoryRecord,
  useSaveMemoryFile,
} from '@/hooks/use-memory';
import { cn } from '@/lib/cn';
import {
  baseName,
  formatMemoryDate,
  formatMemoryTime,
  kindKey,
  splitFrontmatter,
} from '@/lib/memory';
import type { MemoryProject, MemoryRecord, RecordPatch, SessionNote } from '@/lib/types';
import { guardMemory, useUiStore } from '@/state/ui-store';
import { chipBase, focusRing, KIND_VIEW } from './kinds';

const soft = 'bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]';

function splitName(name: string): [string, string] {
  const m = name.match(/^(.*[\s:-])([^\s:-]+)$/);
  return m ? [m[1] ?? '', m[2] ?? ''] : ['', name];
}

function ErrorPlate({ text }: { text: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 font-mono text-xs leading-normal [overflow-wrap:anywhere] text-[var(--color-danger)]"
    >
      <CircleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0">{text}</span>
    </div>
  );
}

function WarnPlate({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] px-4 py-3 text-[12.5px] leading-normal font-medium text-[var(--color-warning)]"
    >
      <CircleAlert className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 font-bold">{text}</span>
      <span className="flex shrink-0 gap-1.5">{children}</span>
    </div>
  );
}

function PlateButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-full bg-[color-mix(in_srgb,var(--color-warning)_20%,transparent)] px-3 text-xs font-bold whitespace-nowrap text-[var(--color-text-primary)] hover:bg-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] active:scale-[.96]',
        focusRing,
      )}
    >
      {children}
    </button>
  );
}

function Field({ name, value }: { name: string; value: string }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-[var(--color-bg-tertiary)] px-[9px] font-mono text-[11px] text-[var(--color-text-primary)]">
      <i className="shrink-0 text-[var(--color-text-muted)] not-italic">{name}</i>
      <span className="truncate">{value}</span>
    </span>
  );
}

function ActionButton({
  icon: Icon,
  label,
  danger,
  primary,
  disabled,
  onClick,
}: {
  icon: typeof Pin;
  label: string;
  danger?: boolean;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-full pr-3.5 pl-3 text-[13px] whitespace-nowrap transition-[background-color,transform] duration-200 ease-[var(--ease-trail)] active:scale-[.96] disabled:pointer-events-none disabled:opacity-50 @max-[520px]:w-9 @max-[520px]:px-0',
        focusRing,
        primary
          ? 'bg-[var(--color-text-primary)] font-bold text-[var(--color-bg-primary)] hover:bg-[color-mix(in_srgb,var(--color-text-primary)_88%,var(--color-bg-primary))]'
          : cn(
              'bg-[var(--color-bg-tertiary)] font-medium hover:bg-[var(--color-hover)]',
              danger ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-primary)]',
            ),
      )}
    >
      <Icon
        className={cn(
          'h-[15px] w-[15px] shrink-0',
          primary ? '' : danger ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]',
        )}
        strokeWidth={1.75}
      />
      <span className="@max-[520px]:sr-only">{label}</span>
    </button>
  );
}

function MoveDialog({
  open,
  record,
  targets,
  onCancel,
  onMoved,
}: {
  open: boolean;
  record: MemoryRecord;
  targets: MemoryProject[];
  onCancel: () => void;
  onMoved: () => void;
}) {
  const move = useMoveMemoryRecord();
  const [slug, setSlug] = useState<string | null>(null);
  const chosen = slug ?? targets[0]?.slug ?? null;

  return (
    <ConfirmDialog
      open={open}
      title="Перенести запись"
      description="Запись переедет в папку памяти выбранного проекта."
      confirmLabel="Перенести"
      subject={{ title: record.name, chips: [record.kind ?? 'запись'] }}
      busy={move.isPending}
      onCancel={onCancel}
      onConfirm={async () => {
        if (!chosen) throw new Error('Нет проекта, куда можно перенести запись');
        await move.mutateAsync({ path: record.path, targetSlug: chosen });
        onMoved();
      }}
    >
      {targets.length === 0 ? (
        <p className="text-[13px] font-medium text-[var(--color-text-muted)]">
          Других проектов с памятью нет.
        </p>
      ) : (
        <fieldset className="m-0 flex flex-col gap-0.5 border-0 p-0">
          {targets.map((p) => {
            const on = p.slug === chosen;
            return (
              <label
                key={p.slug}
                className={cn(
                  'flex h-11 cursor-pointer items-center gap-2.5 rounded-full px-3.5 text-sm transition-colors duration-200 ease-[var(--ease-trail)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-accent)]',
                  on
                    ? 'bg-[var(--color-text-primary)] font-bold text-[var(--color-bg-primary)]'
                    : 'font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]',
                )}
              >
                <input
                  type="radio"
                  name="move-target"
                  className="sr-only"
                  checked={on}
                  onChange={() => setSlug(p.slug)}
                />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span
                  className={cn(
                    'text-[11px] tabular-nums',
                    on
                      ? 'text-[color-mix(in_srgb,var(--color-bg-primary)_62%,transparent)]'
                      : 'text-[var(--color-text-muted)]',
                  )}
                >
                  {p.records}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
    </ConfirmDialog>
  );
}

export function MemoryDetail({
  path,
  record,
  note,
  removed,
  projects,
  currentSlug,
  onClose,
  onArchived,
}: {
  path: string;
  record: MemoryRecord | null;
  note: SessionNote | null;
  removed: boolean;
  projects: MemoryProject[];
  currentSlug: string;
  onClose: () => void;
  onArchived: (name: string, archivedPath: string) => void;
}) {
  const file = useMemoryFile(path);
  const save = useSaveMemoryFile();
  const patch = usePatchMemoryRecord();
  const archive = useArchiveMemoryRecord();
  const restore = useRestoreMemoryRecord();
  const setDirty = useUiStore((s) => s.setMemoryDirty);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [base, setBase] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  const dirty = editing && draft !== base;
  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  const requestClose = () => guardMemory(onClose);
  const forceClose = () => {
    setDirty(false);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || editing) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (e.target instanceof Element && e.target.closest('input, textarea')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing]);

  const text = file.data?.text ?? '';
  const { body } = splitFrontmatter(text);
  const busy = patch.isPending || archive.isPending || restore.isPending || save.isPending;
  const archivedRecord = record?.archived === true;
  const external = editing && file.data !== undefined && file.data.text !== base;

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(String(e));
    }
  };
  const applyPatch = (p: RecordPatch) => {
    if (record) void run(() => patch.mutateAsync({ path: record.path, patch: p }));
  };

  const title = record?.name ?? note?.title ?? baseName(path);
  const [light, bold] = splitName(title);
  const kind = record ? KIND_VIEW[kindKey(record.kind)] : null;
  const KindIcon = kind?.Icon;
  const description = record?.description;
  const fields: [string, string][] = [];
  if (record) {
    if (record.files.length) fields.push(['files', record.files.join(', ')]);
    if (record.tags.length) fields.push(['tags', record.tags.join(', ')]);
    if (record.updated) fields.push(['updated', record.updated]);
    if (record.supersedes) fields.push(['supersedes', record.supersedes]);
    if (record.validTo) fields.push(['valid_to', record.validTo]);
  } else if (note) {
    if (note.sessionId) fields.push(['session_id', note.sessionId]);
    fields.push(['capture', note.capture]);
    fields.push(['updated', note.updated]);
  }
  const itemError = record?.error ?? note?.error ?? null;

  return (
    <div className="@container flex h-full flex-col gap-3.5 overflow-hidden px-4 pt-5">
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex items-start gap-3 px-1">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <h2 className="text-[22px] leading-[1.12] font-light tracking-[-0.02em] [overflow-wrap:anywhere] text-[var(--color-text-primary)]">
              {light}
              <b className="font-bold">{bold}</b>
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {record && kind && KindIcon && (
                <span
                  className={cn(
                    chipBase,
                    'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
                  )}
                >
                  <KindIcon className={cn('h-[13px] w-[13px]', kind.color)} strokeWidth={1.75} />
                  {kind.label}
                </span>
              )}
              {record?.status === 'fact' && (
                <span
                  className={cn(
                    chipBase,
                    'bg-[var(--color-accent-soft)] text-[var(--color-text-primary)]',
                  )}
                >
                  <CircleCheck
                    className="h-[13px] w-[13px] text-[var(--color-accent)]"
                    strokeWidth={1.75}
                  />
                  факт
                </span>
              )}
              {record?.stale && (
                <span
                  className={cn(
                    chipBase,
                    'bg-[var(--color-bg-tertiary)] text-[var(--color-warning)]',
                  )}
                >
                  устарела
                </span>
              )}
              {record && (
                <span
                  className={cn(
                    chipBase,
                    'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
                  )}
                >
                  seen <b className="font-bold text-[var(--color-text-primary)]">{record.seen}</b>
                </span>
              )}
              {record && (
                <span
                  className={cn(
                    chipBase,
                    'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
                  )}
                >
                  важность{' '}
                  <b className="font-bold text-[var(--color-text-primary)]">{record.importance}</b>
                </span>
              )}
              {note && (
                <>
                  <span
                    className={cn(
                      chipBase,
                      'bg-[var(--color-bg-tertiary)]',
                      note.capture === 'extractive'
                        ? 'text-[var(--color-warning)]'
                        : 'text-[var(--color-text-muted)]',
                    )}
                  >
                    <Clock className="h-[13px] w-[13px]" strokeWidth={1.75} />
                    {note.capture === 'claude' ? 'Claude' : 'черновик'}
                  </span>
                  <span
                    className={cn(
                      chipBase,
                      'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
                    )}
                  >
                    {formatMemoryDate(note.updated)} ·{' '}
                    <b className="font-bold text-[var(--color-text-primary)]">
                      {formatMemoryTime(note.updated)}
                    </b>
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!editing && (
              <ActionButton
                icon={Pencil}
                label="Редактировать"
                primary
                disabled={!file.data || busy}
                onClick={() => {
                  setDraft(text);
                  setBase(text);
                  setActionError(null);
                  save.reset();
                  setEditing(true);
                }}
              />
            )}
            <button
              type="button"
              aria-label="Закрыть"
              title="Закрыть (Esc)"
              onClick={requestClose}
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

        {record && !editing && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {archivedRecord ? (
              <ActionButton
                icon={RotateCcw}
                label="Восстановить"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await restore.mutateAsync(record.path);
                    onClose();
                  })
                }
              />
            ) : (
              <>
                <ActionButton
                  icon={record.importance === 3 ? PinOff : Pin}
                  label={record.importance === 3 ? 'Открепить' : 'Закрепить'}
                  disabled={busy}
                  onClick={() => applyPatch({ importance: record.importance === 3 ? 2 : 3 })}
                />
                <ActionButton
                  icon={CircleCheck}
                  label={record.status === 'fact' ? 'Сделать наблюдением' : 'Сделать фактом'}
                  disabled={busy}
                  onClick={() =>
                    applyPatch({ status: record.status === 'fact' ? 'observation' : 'fact' })
                  }
                />
                <ActionButton
                  icon={ArrowRight}
                  label="Перенести…"
                  disabled={busy}
                  onClick={() => setMoveOpen(true)}
                />
                <ActionButton
                  icon={Trash2}
                  label="Удалить"
                  danger
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const { archivedPath } = await archive.mutateAsync(record.path);
                      onArchived(record.name, archivedPath);
                      onClose();
                    })
                  }
                />
              </>
            )}
          </div>
        )}
        {removed && (
          <WarnPlate text="Файл удалён снаружи">
            <PlateButton onClick={forceClose}>Закрыть</PlateButton>
          </WarnPlate>
        )}
        {external && (
          <WarnPlate text="Файл изменился снаружи">
            <PlateButton
              onClick={() => {
                setDraft(text);
                setBase(text);
              }}
            >
              Взять новую версию
            </PlateButton>
            <PlateButton onClick={() => setBase(text)}>Оставить мою</PlateButton>
          </WarnPlate>
        )}
        {actionError && <ErrorPlate text={actionError} />}
        {itemError && <ErrorPlate text={itemError} />}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 pb-[88px]">
        {description && !editing && (
          <p className="text-[13px] leading-normal font-medium text-[var(--color-text-muted)]">
            {description}
          </p>
        )}
        {fields.length > 0 && !editing && (
          <div className="flex flex-wrap gap-1.5">
            {fields.map(([k, v]) => (
              <Field key={k} name={k} value={v} />
            ))}
          </div>
        )}
        {editing ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              aria-label="Файл записи"
              className="min-h-[260px] flex-1 resize-none rounded-[20px] bg-[var(--color-bg-primary)] px-4 py-3.5 font-mono text-xs leading-[1.65] text-[var(--color-text-primary)] shadow-[inset_0_1px_3px_var(--color-press-shade)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            />
            {save.error && <ErrorPlate text={String(save.error)} />}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                {dirty ? 'Есть несохранённые изменения' : 'Без изменений'}
              </span>
              <span className="flex gap-1.5">
                <ActionButton
                  icon={X}
                  label="Отмена"
                  disabled={save.isPending}
                  onClick={() => guardMemory(() => setEditing(false))}
                />
                <button
                  type="button"
                  disabled={save.isPending || draft === text}
                  onClick={() =>
                    save.mutate({ path, text: draft }, { onSuccess: () => setEditing(false) })
                  }
                  className={cn(
                    'inline-flex h-9 items-center rounded-full bg-[var(--color-accent)] px-4 text-[13px] font-bold text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] active:scale-[.96] disabled:pointer-events-none disabled:opacity-40',
                    focusRing,
                  )}
                >
                  {save.isPending ? 'Сохраняю…' : 'Сохранить'}
                </button>
              </span>
            </div>
          </div>
        ) : file.isLoading ? (
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--color-text-muted)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)] motion-reduce:animate-none" />
            Читаю файл…
          </span>
        ) : file.isError ? (
          <div className="flex flex-col items-start gap-2.5">
            <ErrorPlate text={String(file.error)} />
            <button
              type="button"
              onClick={() => void file.refetch()}
              className={cn(
                'rounded-full px-2 text-[13px] font-medium text-[var(--color-accent)] hover:underline',
                focusRing,
              )}
            >
              Повторить
            </button>
          </div>
        ) : (
          <Markdown body={itemError ? text : body} className="tool-md" />
        )}
      </div>

      {record && !archivedRecord && (
        <MoveDialog
          open={moveOpen}
          record={record}
          targets={projects.filter((p) => p.slug !== currentSlug)}
          onCancel={() => setMoveOpen(false)}
          onMoved={() => {
            setMoveOpen(false);
            onClose();
          }}
        />
      )}
    </div>
  );
}
