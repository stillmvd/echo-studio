import { describe, expect, it } from 'vitest';
import { askToMarkdown, parseAsk } from './ask-question';
import type { DisplayItem } from './types';

function display(p: Partial<DisplayItem>): DisplayItem {
  return {
    uuid: 'u',
    parentUuid: null,
    timestamp: null,
    kind: 'tool_use',
    role: 'assistant',
    text: null,
    toolName: 'AskUserQuestion',
    toolInputSummary: null,
    toolInputJson: null,
    isError: null,
    raw: {},
    ...p,
  };
}

const use = display({
  toolInputJson: {
    questions: [
      {
        question: 'Как чистить AMD?',
        header: 'Чистка',
        multiSelect: false,
        options: [
          { label: 'Скриптом (Recommended)', description: 'Сам удалю' },
          { label: 'DDU', description: 'Эталон' },
        ],
      },
      {
        question: 'Что проверить?',
        header: 'Проверки',
        multiSelect: true,
        options: [
          { label: 'Тесты, сборка', description: null },
          { label: 'Линт', description: null },
          { label: 'Типы', description: null },
        ],
      },
    ],
  },
});

const result = (toolUseResult: unknown, text = 'Your questions have been answered') =>
  display({ kind: 'tool_result', text, raw: { toolUseResult } });

describe('parseAsk', () => {
  it('marks single and multi picks, even with commas inside labels', () => {
    const card = parseAsk(
      use,
      result({
        answers: { 'Как чистить AMD?': 'DDU', 'Что проверить?': 'Тесты, сборка, Типы' },
        annotations: { 'Как чистить AMD?': { notes: 'вечером' } },
      }),
    );
    expect(card?.answered).toBe(true);
    expect(card?.questions[0]?.options.map((o) => o.picked)).toEqual([false, true]);
    expect(card?.questions[0]?.notes).toBe('вечером');
    expect(card?.questions[1]?.options.map((o) => o.picked)).toEqual([true, false, true]);
    expect(card?.questions[1]?.other).toBeNull();
  });

  it('keeps a custom answer as text', () => {
    const card = parseAsk(use, result({ answers: { 'Как чистить AMD?': 'Сам решу' } }));
    expect(card?.questions[0]?.other).toBe('Сам решу');
    expect(card?.questions[0]?.options.some((o) => o.picked)).toBe(false);
  });

  it('falls back to the result text when toolUseResult is missing', () => {
    const card = parseAsk(
      use,
      display({
        kind: 'tool_result',
        text: 'Your questions have been answered: "Как чистить AMD?"="DDU". You can now continue.',
      }),
    );
    expect(card?.questions[0]?.options[1]?.picked).toBe(true);
  });

  it('shows no answer for a rejected call and raw text when unparsed', () => {
    const rejected = parseAsk(use, display({ kind: 'tool_result', text: 'denied', isError: true }));
    expect(rejected?.answered).toBe(false);
    expect(rejected?.rawResult).toBeNull();
    const odd = parseAsk(use, display({ kind: 'tool_result', text: 'something else' }));
    expect(odd?.rawResult).toBe('something else');
  });

  it('exports question → answer lines', () => {
    const card = parseAsk(use, result({ answers: { 'Как чистить AMD?': 'DDU' } }));
    expect(card && askToMarkdown(card)).toBe(
      '- **Как чистить AMD?** → DDU\n- **Что проверить?** → —',
    );
  });
});
