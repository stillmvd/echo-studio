import { Check, StickyNote } from 'lucide-react';
import type { AskCard, AskQuestion } from '@/lib/ask-question';
import { cn } from '@/lib/cn';

const chip =
  'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap';

function Question({ q, answered }: { q: AskQuestion; answered: boolean }) {
  const tags = [q.header, q.multiSelect ? 'multiple' : null].filter(Boolean);
  return (
    <div className="flex flex-col gap-1.5">
      {(tags.length > 0 || !answered) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className={cn(chip, 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]')}
            >
              {t}
            </span>
          ))}
          {!answered && (
            <span
              className={cn(
                chip,
                'bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)]',
              )}
            >
              No answer
            </span>
          )}
        </div>
      )}
      <p className="text-sm leading-[1.4] font-bold text-pretty text-[var(--color-text-primary)]">
        {q.question}
      </p>
      <ul className="flex flex-col gap-1.5">
        {q.options.map((o) => (
          <li
            key={o.label}
            className={cn(
              'flex items-start gap-2 text-[13px] leading-[1.45]',
              o.picked ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]',
            )}
          >
            <span className="mt-px grid h-4 w-4 shrink-0 place-items-center text-[var(--color-accent)]">
              {o.picked ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-border)]" />
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={o.picked ? 'font-bold' : 'font-medium'}>{o.label}</span>
              {o.picked && o.description && (
                <span className="text-xs font-medium text-[var(--color-text-muted)]">
                  {o.description}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {q.other && (
        <div className="flex flex-col gap-0.5 rounded-[14px] bg-[var(--color-bg-primary)] px-3.5 py-2.5 text-[13px] leading-normal [overflow-wrap:anywhere] whitespace-pre-wrap text-[var(--color-text-primary)]">
          <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
            Your answer
          </span>
          {q.other}
        </div>
      )}
      {q.notes && (
        <p className="flex items-start gap-1.5 text-xs leading-normal font-medium [overflow-wrap:anywhere] whitespace-pre-wrap text-[var(--color-text-muted)]">
          <StickyNote className="mt-0.5 h-[13px] w-[13px] shrink-0" strokeWidth={1.75} />
          {q.notes}
        </p>
      )}
    </div>
  );
}

export function AskQuestionCard({ card }: { card: AskCard }) {
  return (
    <div className="flex flex-col gap-4 pt-1">
      {card.questions.map((q) => (
        <Question key={q.question} q={q} answered={card.answered} />
      ))}
      {card.rawResult && (
        <pre className="rounded-[14px] bg-[var(--color-bg-primary)] px-3 py-2.5 font-mono text-xs leading-normal whitespace-pre-wrap text-[var(--color-text-muted)] [overflow-wrap:anywhere]">
          {card.rawResult}
        </pre>
      )}
    </div>
  );
}
