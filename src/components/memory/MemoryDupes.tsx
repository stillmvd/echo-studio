import {
  Archive,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  CircleAlert,
  EyeOff,
  Merge,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import { useIgnoreMemoryDuplicate, useMemoryFile, useMergeMemoryRecords } from '@/hooks/use-memory';
import { cn } from '@/lib/cn';
import {
  DUPE_THRESHOLD,
  formatMemoryDate,
  kindKey,
  mergedFields,
  pickCanonical,
  plural,
  similarityShare,
  splitFrontmatter,
  todayIso,
} from '@/lib/memory';
import type { DuplicatePair, MemoryProject, MemoryRecord } from '@/lib/types';
import { chipBase, focusRing, KIND_VIEW } from './kinds';

const ghostButton = cn(
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap text-[var(--color-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] active:scale-[.96] disabled:pointer-events-none disabled:opacity-50',
  focusRing,
);
const pairKey = (p: DuplicatePair) => `${p.a.path}|${p.b.path}`;
const softButton = cn(
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-bg-tertiary)] pr-3.5 pl-3 text-[13px] font-medium whitespace-nowrap text-[var(--color-text-primary)] transition-[background-color,transform] duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)] active:scale-[.96] disabled:pointer-events-none disabled:opacity-50',
  focusRing,
);

function Similarity({ score }: { score: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-2"
      title={`Сходство заголовков: ${Math.round(score * 100)} %`}
    >
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
        <span
          className="block h-full rounded-full bg-[var(--color-warning)]"
          style={{ width: `${Math.round(similarityShare(score) * 100)}%` }}
        />
      </span>
      <b className="text-xs font-bold text-[var(--color-text-primary)] tabular-nums">
        {Math.round(score * 100)} %
      </b>
    </span>
  );
}

function KindMark({ record }: { record: MemoryRecord }) {
  const kind = KIND_VIEW[kindKey(record.kind)];
  return <kind.Icon className={cn('h-4 w-4 shrink-0', kind.color)} strokeWidth={1.75} />;
}

function PairRow({
  pair,
  onMerge,
  onIgnore,
}: {
  pair: DuplicatePair;
  onMerge: () => void;
  onIgnore: () => void;
}) {
  const line = (r: MemoryRecord) => (
    <span className="flex min-w-0 items-center gap-2 text-[13px]">
      <KindMark record={r} />
      <b className="max-w-[45%] shrink-0 truncate font-bold text-[var(--color-text-primary)]">
        {r.name}
      </b>
      <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-text-muted)]">
        {r.description}
      </span>
    </span>
  );
  return (
    <li className="flex items-center gap-3 rounded-[20px] px-3 py-2.5 transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)]">
      <span
        aria-hidden
        className="my-2 w-2.5 shrink-0 self-stretch rounded-l-lg border-2 border-r-0 border-[var(--color-border)]"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        {line(pair.a)}
        {line(pair.b)}
      </span>
      <Similarity score={pair.score} />
      <button
        type="button"
        aria-label={`Не дубли: ${pair.a.name} и ${pair.b.name}`}
        title="Это разные записи — убрать пару из дублей"
        onClick={onIgnore}
        className={ghostButton}
      >
        <EyeOff className="h-[15px] w-[15px]" strokeWidth={1.75} />
        Не дубли
      </button>
      <button
        type="button"
        aria-label={`Слить ${pair.a.name} и ${pair.b.name}`}
        onClick={onMerge}
        className={softButton}
      >
        <Merge className="h-[15px] w-[15px] text-[var(--color-text-muted)]" strokeWidth={1.75} />
        Слить…
      </button>
    </li>
  );
}

function useBody(path: string) {
  const file = useMemoryFile(path);
  return file.data ? splitFrontmatter(file.data.text).body.trim() : null;
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        chipBase,
        'bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] text-[var(--color-text-muted)]',
      )}
    >
      {children}
    </span>
  );
}

function Side({
  record,
  body,
  keep,
}: {
  record: MemoryRecord;
  body: string | null;
  keep: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-[20px] bg-[var(--color-bg-tertiary)] px-4 py-3.5',
        keep ? 'shadow-[inset_0_0_0_1.5px_var(--color-accent)]' : 'opacity-75',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <KindMark record={record} />
        <b className="min-w-0 text-[15px] font-bold [overflow-wrap:anywhere] text-[var(--color-text-primary)]">
          {record.name}
        </b>
        <span
          className={cn(
            chipBase,
            'ml-auto',
            keep
              ? 'bg-[var(--color-accent-soft)] text-[var(--color-text-primary)]'
              : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]',
          )}
        >
          {keep ? (
            <Check className="h-3 w-3 text-[var(--color-accent)]" strokeWidth={2} />
          ) : (
            <Archive className="h-3 w-3" strokeWidth={1.75} />
          )}
          {keep ? 'остаётся' : 'в архив'}
        </span>
      </div>
      <p className="text-[13px] leading-normal font-medium text-[var(--color-text-muted)]">
        {record.description}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Meta>
          seen <b className="font-bold text-[var(--color-text-primary)]">{record.seen}</b>
        </Meta>
        <Meta>
          важность <b className="font-bold text-[var(--color-text-primary)]">{record.importance}</b>
        </Meta>
        <Meta>{formatMemoryDate(record.updated)}</Meta>
      </div>
      <div className="max-h-[220px] overflow-y-auto text-[12.5px]">
        {body === null ? (
          <span className="text-xs text-[var(--color-text-muted)]">Читаю файл…</span>
        ) : (
          <Markdown body={body} className="tool-md" />
        )}
      </div>
    </div>
  );
}

function Compare({
  pair,
  projectName,
  onBack,
  onMerged,
  onIgnore,
}: {
  pair: DuplicatePair;
  projectName: string;
  onBack: () => void;
  onMerged: (canonical: MemoryRecord, absorbed: MemoryRecord) => void;
  onIgnore: () => void;
}) {
  const merge = useMergeMemoryRecords();
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => backRef.current?.focus(), []);
  const [swapped, setSwapped] = useState(false);
  const [first, second] = pickCanonical(pair.a, pair.b);
  const canonical = swapped ? second : first;
  const absorbed = swapped ? first : second;
  const bodies = { [pair.a.path]: useBody(pair.a.path), [pair.b.path]: useBody(pair.b.path) };
  const canonicalBody = bodies[canonical.path] ?? null;
  const absorbedBody = bodies[absorbed.path] ?? null;
  const fields = mergedFields(canonical, absorbed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || merge.isPending) return;
      if (e.target instanceof Element && e.target.closest('input, textarea')) return;
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, merge.isPending]);

  const run = () =>
    merge.mutate(
      { canonical: canonical.path, absorbed: [absorbed.path] },
      { onSuccess: () => onMerged(canonical, absorbed) },
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-8">
      <div className="flex flex-wrap items-center gap-3 pr-1 pl-1">
        <button ref={backRef} type="button" onClick={onBack} className={softButton}>
          <ArrowLeft
            className="h-[15px] w-[15px] text-[var(--color-text-muted)]"
            strokeWidth={1.75}
          />
          К дублям
        </button>
        <h2 className="text-[22px] leading-[1.1] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
          Слить <b className="font-bold">записи</b>
        </h2>
        <Similarity score={pair.score} />
        <span className="text-xs font-medium text-[var(--color-text-muted)]">{projectName}</span>
        <button
          type="button"
          disabled={merge.isPending}
          title="Это разные записи — убрать пару из дублей"
          onClick={onIgnore}
          className={cn(ghostButton, 'ml-auto')}
        >
          <EyeOff className="h-[15px] w-[15px]" strokeWidth={1.75} />
          Не дубли
        </button>
        <button
          type="button"
          disabled={merge.isPending}
          onClick={run}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--color-accent)] pr-4 pl-3 text-[13px] font-bold text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] active:scale-[.96] disabled:pointer-events-none disabled:opacity-50',
            focusRing,
          )}
        >
          <Merge className="h-[15px] w-[15px]" strokeWidth={1.75} />
          {merge.isPending ? 'Сливаю…' : 'Слить'}
        </button>
      </div>
      <p className="px-1 text-[13px] leading-normal font-medium text-[var(--color-text-muted)]">
        Левая запись останется, правая допишется в неё блоком и уйдёт в архив. ⇄ — поменять местами.
      </p>
      {merge.error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 font-mono text-xs leading-normal [overflow-wrap:anywhere] text-[var(--color-danger)]"
        >
          <CircleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0">{String(merge.error)}</span>
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 @max-[720px]:grid-cols-1">
        <Side record={canonical} body={canonicalBody} keep />
        <div className="flex flex-col items-center gap-1 self-center">
          <span
            aria-hidden
            className="text-lg leading-none text-[var(--color-accent)] @max-[720px]:rotate-90"
          >
            ←
          </span>
          <button
            type="button"
            aria-label="Поменять местами"
            title="Поменять, какая запись остаётся"
            disabled={merge.isPending}
            onClick={() => setSwapped((s) => !s)}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-hover)] active:scale-[.96]',
              focusRing,
            )}
          >
            <ArrowLeftRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <Side record={absorbed} body={absorbedBody} keep={false} />
      </div>
      <span className="px-1 text-xs font-bold tracking-[.02em] text-[var(--color-text-muted)]">
        Итог
      </span>
      <div className="flex flex-col gap-2.5 rounded-[20px] bg-[var(--color-bg-tertiary)] px-4 py-3.5">
        <div className="flex flex-wrap gap-1.5">
          <Meta>
            seen <b className="font-bold text-[var(--color-text-primary)]">{fields.seen}</b>
          </Meta>
          <Meta>
            важность{' '}
            <b className="font-bold text-[var(--color-text-primary)]">{fields.importance}</b>
          </Meta>
          {fields.tags.length > 0 && <Meta>tags {fields.tags.join(', ')}</Meta>}
          {fields.files.length > 0 && <Meta>files {fields.files.join(', ')}</Meta>}
        </div>
        {canonicalBody !== null && <Markdown body={canonicalBody} className="tool-md" />}
        <div className="rounded-[14px] bg-[var(--color-accent-soft)] px-3 py-2.5">
          <span className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-muted)]">
            <Merge className="h-3 w-3 text-[var(--color-accent)]" strokeWidth={1.75} />
            из {absorbed.name} · {todayIso()}
          </span>
          {absorbedBody !== null && <Markdown body={absorbedBody} className="tool-md" />}
        </div>
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          {absorbed.name} уйдёт в архив с <code className="font-mono">consolidated_into</code>, его
          строка в MEMORY.md будет убрана.
        </span>
      </div>
    </div>
  );
}

export function MemoryDupes({
  pairs,
  projects,
  isLoading,
  error,
  onRetry,
  onMerged,
  onIgnored,
}: {
  pairs: DuplicatePair[];
  projects: MemoryProject[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onMerged: (canonical: MemoryRecord, absorbed: MemoryRecord) => void;
  onIgnored: (pair: DuplicatePair) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const ignore = useIgnoreMemoryDuplicate();
  const [ignoreError, setIgnoreError] = useState<string | null>(null);
  const hide = (p: DuplicatePair) => {
    setIgnoreError(null);
    ignore.mutate(
      { slug: p.slug, a: p.a.file, b: p.b.file, ignored: true },
      {
        onSuccess: () => {
          setOpenKey(null);
          onIgnored(p);
        },
        onError: (e) => setIgnoreError(String(e)),
      },
    );
  };
  const open = pairs.find((p) => pairKey(p) === openKey) ?? null;
  const nameOf = useMemo(() => new Map(projects.map((p) => [p.slug, p.name])), [projects]);
  const groups = useMemo(() => {
    const out: { slug: string; items: DuplicatePair[] }[] = [];
    for (const p of pairs) {
      let g = out.find((x) => x.slug === p.slug);
      if (!g) {
        g = { slug: p.slug, items: [] };
        out.push(g);
      }
      g.items.push(p);
    }
    return out;
  }, [pairs]);

  if (open) {
    return (
      <div className="@container flex h-full flex-col gap-3 overflow-hidden px-4 pt-5">
        {ignoreError && (
          <span
            role="alert"
            className="mx-1 rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 font-mono text-xs [overflow-wrap:anywhere] text-[var(--color-danger)]"
          >
            {ignoreError}
          </span>
        )}
        <Compare
          key={openKey}
          pair={open}
          projectName={nameOf.get(open.slug) ?? open.slug}
          onBack={() => setOpenKey(null)}
          onMerged={(c, a) => {
            setOpenKey(null);
            onMerged(c, a);
          }}
          onIgnore={() => hide(open)}
        />
      </div>
    );
  }

  return (
    <div className="@container flex h-full flex-col gap-3.5 overflow-hidden px-4 pt-5">
      <div className="flex flex-col gap-2.5 pr-1 pl-2">
        <h2 className="text-[28px] leading-[1.06] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
          Дубли <b className="font-bold">по всей памяти</b>
        </h2>
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          <b className="font-bold text-[var(--color-text-primary)]">{pairs.length}</b>{' '}
          {plural(pairs.length, 'пара', 'пары', 'пар')} в{' '}
          <b className="font-bold text-[var(--color-text-primary)]">{groups.length}</b>{' '}
          {plural(groups.length, 'проекте', 'проектах', 'проектах')} · сходство заголовков от{' '}
          {Math.round(DUPE_THRESHOLD * 100)} %
        </span>
      </div>
      {ignoreError && (
        <span
          role="alert"
          className="mx-1 rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 font-mono text-xs [overflow-wrap:anywhere] text-[var(--color-danger)]"
        >
          {ignoreError}
        </span>
      )}
      {error ? (
        <div className="flex flex-col items-start gap-2.5 px-1">
          <span className="rounded-2xl bg-[var(--color-danger-soft)] px-4 py-3 font-mono text-xs [overflow-wrap:anywhere] text-[var(--color-danger)]">
            {String(error)}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              'rounded-full px-2 text-[13px] font-medium text-[var(--color-accent)] hover:underline',
              focusRing,
            )}
          >
            Повторить
          </button>
        </div>
      ) : isLoading ? (
        <span className="inline-flex items-center gap-2 px-2 text-[13px] font-medium text-[var(--color-text-muted)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)] motion-reduce:animate-none" />
          Ищу похожие записи…
        </span>
      ) : pairs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-4 pb-[88px] text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] text-[var(--color-text-muted)]">
            <Check className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <h3 className="text-[22px] leading-[1.06] font-light tracking-[-0.02em] text-[var(--color-text-primary)]">
            Дублей <b className="font-bold">нет</b>
          </h3>
          <p className="max-w-[420px] text-[13px] leading-normal font-medium text-[var(--color-text-muted)]">
            Похожих записей от {Math.round(DUPE_THRESHOLD * 100)} % ни в одном проекте. Раздел
            проверяет заново, когда меняются файлы памяти.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {groups.map((g) => (
            <section key={g.slug}>
              <h3 className="sticky top-0 z-[1] bg-[var(--color-bg-secondary)] px-3 pt-3 pb-1.5 text-xs font-medium text-[var(--color-text-muted)]">
                <b className="font-bold text-[var(--color-text-primary)]">
                  {nameOf.get(g.slug) ?? g.slug}
                </b>{' '}
                {g.items.length} {plural(g.items.length, 'пара', 'пары', 'пар')}
              </h3>
              <ul className="flex flex-col gap-0.5">
                {g.items.map((p) => (
                  <PairRow
                    key={pairKey(p)}
                    pair={p}
                    onMerge={() => setOpenKey(pairKey(p))}
                    onIgnore={() => hide(p)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
