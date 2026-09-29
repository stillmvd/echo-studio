import { CircleCheck, Folder, Pin } from 'lucide-react';
import { cn } from '@/lib/cn';
import { baseName, formatMemoryDate, formatMemoryTime, kindKey } from '@/lib/memory';
import { highlightSegments } from '@/lib/tooling';
import type { MemoryHit, MemoryRecord, SessionNote } from '@/lib/types';
import { chipBase, focusRing, KIND_VIEW } from './kinds';

const rowBase =
  'flex w-full items-center gap-3 rounded-[20px] text-left transition-colors duration-200 ease-[var(--ease-trail)] select-none';

function rowTone(selected: boolean) {
  return selected
    ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)]'
    : 'text-[var(--color-text-primary)] hover:bg-[var(--color-hover)]';
}

function tagTone(selected: boolean) {
  return selected
    ? 'bg-[color-mix(in_srgb,var(--color-bg-primary)_16%,transparent)] text-inherit'
    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]';
}

export function Highlight({ text, query }: { text: string; query: string }) {
  let offset = 0;
  return (
    <>
      {highlightSegments(text, query).map((s) => {
        const key = offset;
        offset += s.text.length;
        return s.hit ? (
          <mark
            key={key}
            className="rounded-[4px] bg-[var(--color-accent-soft)] text-inherit shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]"
          >
            {s.text}
          </mark>
        ) : (
          <span key={key}>{s.text}</span>
        );
      })}
    </>
  );
}

export function RecordRow({
  record,
  selected,
  onSelect,
}: {
  record: MemoryRecord;
  selected: boolean;
  onSelect: () => void;
}) {
  const { Icon, color } = KIND_VIEW[kindKey(record.kind)];
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        rowBase,
        'h-[60px] pr-3 pl-2.5',
        focusRing,
        rowTone(selected),
        record.stale && !selected && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-full',
          selected
            ? 'bg-[color-mix(in_srgb,var(--color-bg-primary)_16%,transparent)] text-inherit'
            : cn('bg-[var(--color-bg-tertiary)]', color),
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-bold">{record.name}</span>
        <span
          className={cn(
            'truncate text-[13px] font-medium',
            selected
              ? 'text-[color-mix(in_srgb,var(--color-bg-primary)_62%,transparent)]'
              : 'text-[var(--color-text-muted)]',
          )}
        >
          {record.description}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {record.status === 'fact' && (
          <span
            className={cn(
              chipBase,
              'h-[22px] px-2',
              selected
                ? tagTone(true)
                : 'bg-[var(--color-accent-soft)] text-[var(--color-text-primary)]',
            )}
          >
            <CircleCheck
              className={cn('h-3 w-3', !selected && 'text-[var(--color-accent)]')}
              strokeWidth={1.75}
            />
            факт
          </span>
        )}
        {record.stale && (
          <span
            className={cn(
              chipBase,
              'h-[22px] px-2',
              selected
                ? tagTone(true)
                : 'bg-[var(--color-bg-tertiary)] text-[var(--color-warning)]',
            )}
          >
            устарела
          </span>
        )}
        {record.seen > 1 && (
          <span className={cn(chipBase, 'h-[22px] px-2', tagTone(selected))}>
            seen {record.seen}
          </span>
        )}
        {record.importance === 3 && (
          <Pin
            className={cn('h-3.5 w-3.5', !selected && 'text-[var(--color-accent)]')}
            strokeWidth={1.75}
          />
        )}
      </span>
    </button>
  );
}

export function SessionRow({
  note,
  selected,
  onSelect,
}: {
  note: SessionNote;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cn(rowBase, 'h-16 py-2.5 pr-3.5 pl-3.5', focusRing, rowTone(selected))}
    >
      <span className="flex w-11 shrink-0 flex-col gap-px">
        <b className="text-[13px] font-bold">{formatMemoryDate(note.updated)}</b>
        <span
          className={cn(
            'text-[11px] font-medium tabular-nums',
            selected
              ? 'text-[color-mix(in_srgb,var(--color-bg-primary)_62%,transparent)]'
              : 'text-[var(--color-text-muted)]',
          )}
        >
          {formatMemoryTime(note.updated)}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-bold">{note.title}</span>
        {note.next && (
          <span
            className={cn(
              'truncate text-xs font-medium',
              selected
                ? 'text-[color-mix(in_srgb,var(--color-bg-primary)_62%,transparent)]'
                : 'text-[var(--color-text-muted)]',
            )}
          >
            Дальше: {note.next}
          </span>
        )}
      </span>
      {note.capture === 'extractive' && (
        <span
          className={cn(
            chipBase,
            'h-[22px] shrink-0 px-2',
            selected ? tagTone(true) : 'bg-[var(--color-bg-tertiary)] text-[var(--color-warning)]',
          )}
        >
          черновик
        </span>
      )}
    </button>
  );
}

export function HitRow({
  hit,
  projectName,
  query,
  onOpen,
}: {
  hit: MemoryHit;
  projectName: string;
  query: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex h-[88px] w-full flex-col justify-center gap-1 overflow-hidden rounded-[20px] px-3.5 text-left text-[var(--color-text-primary)] transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)]',
        focusRing,
      )}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{baseName(hit.path)}</span>
        <span
          className={cn(
            chipBase,
            'shrink-0 bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
          )}
        >
          <Folder className="h-3 w-3" strokeWidth={1.75} />
          {projectName}
        </span>
      </span>
      <span className="line-clamp-2 text-[12.5px] leading-normal font-medium text-[var(--color-text-muted)]">
        <Highlight text={hit.snippet} query={query} />
      </span>
    </button>
  );
}
