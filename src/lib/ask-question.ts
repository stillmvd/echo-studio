import type { DisplayItem } from './types';

export interface AskOption {
  label: string;
  description: string | null;
  picked: boolean;
}

export interface AskQuestion {
  header: string | null;
  question: string;
  multiSelect: boolean;
  options: AskOption[];
  other: string | null;
  notes: string | null;
}

export interface AskCard {
  questions: AskQuestion[];
  answered: boolean;
  rawResult: string | null;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function pick(
  answer: string,
  labels: string[],
  multi: boolean,
): { picked: Set<string>; other: string | null } {
  if (labels.includes(answer)) return { picked: new Set([answer]), other: null };
  if (!multi) return { picked: new Set(), other: answer };
  const picked = new Set<string>();
  let rest = answer;
  while (rest) {
    const next = labels
      .filter((l) => rest === l || rest.startsWith(`${l}, `))
      .sort((a, b) => b.length - a.length)[0];
    if (!next) break;
    picked.add(next);
    rest = rest.slice(next.length).replace(/^, /, '');
  }
  return { picked, other: rest || null };
}

function answersFromText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/"([^"]+)"="([^"]*)"/g)) {
    if (m[1] !== undefined && m[2] !== undefined) out[m[1]] = m[2];
  }
  return out;
}

export function parseAsk(use: DisplayItem, result: DisplayItem | null): AskCard | null {
  const input = use.toolInputJson;
  if (!isObj(input) || !Array.isArray(input.questions)) return null;
  const tool = isObj(result?.raw) ? (result.raw as Obj).toolUseResult : undefined;
  const text = result?.text ?? null;
  let answers: Record<string, unknown> = {};
  let annotations: Record<string, unknown> = {};
  if (isObj(tool) && isObj(tool.answers)) {
    answers = tool.answers;
    if (isObj(tool.annotations)) annotations = tool.annotations;
  } else if (text && !result?.isError) {
    answers = answersFromText(text);
  }

  const questions: AskQuestion[] = input.questions.filter(isObj).map((q) => {
    const question = str(q.question) ?? '';
    const multiSelect = q.multiSelect === true;
    const options = (Array.isArray(q.options) ? q.options : []).filter(isObj).map((o) => ({
      label: str(o.label) ?? '',
      description: str(o.description),
    }));
    const answer = str(answers[question]);
    const { picked, other } = answer
      ? pick(
          answer,
          options.map((o) => o.label),
          multiSelect,
        )
      : { picked: new Set<string>(), other: null };
    const note = annotations[question];
    return {
      header: str(q.header),
      question,
      multiSelect,
      options: options.map((o) => ({ ...o, picked: picked.has(o.label) })),
      other,
      notes: isObj(note) ? str(note.notes) : null,
    };
  });

  const answered = Object.keys(answers).length > 0;
  return {
    questions,
    answered,
    rawResult: !answered && text && !result?.isError ? text : null,
  };
}

export function askToMarkdown(card: AskCard): string {
  return card.questions
    .map((q) => {
      const chosen = q.options.filter((o) => o.picked).map((o) => o.label);
      if (q.other) chosen.push(q.other);
      const answer = card.answered ? chosen.join(', ') || '—' : 'No answer';
      const note = q.notes ? `\n  Note: ${q.notes}` : '';
      return `- **${q.question}** → ${answer}${note}`;
    })
    .join('\n');
}
