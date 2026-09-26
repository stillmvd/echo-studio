import { describe, expect, it } from 'vitest';
import { eventsToMarkdown } from './session-export';
import type { DisplayItem } from './types';

const base = {
  parentUuid: null,
  timestamp: null,
  role: 'assistant',
  text: null,
  toolName: null,
  toolInputSummary: null,
  toolInputJson: null,
  isError: null,
  raw: {},
};

describe('eventsToMarkdown', () => {
  it('writes ask-question calls as question → answer and drops the raw result', () => {
    const use: DisplayItem = {
      ...base,
      uuid: 'a1:0',
      kind: 'tool_use',
      toolName: 'AskUserQuestion',
      toolInputJson: { questions: [{ question: 'Тема?', options: [{ label: 'Тёмная' }] }] },
    };
    const result: DisplayItem = {
      ...base,
      uuid: 'r1:0',
      parentUuid: 'a1',
      kind: 'tool_result',
      role: 'user',
      text: 'Your questions have been answered',
      raw: { toolUseResult: { answers: { 'Тема?': 'Тёмная' } } },
    };
    const md = eventsToMarkdown('s', [use, result]);
    expect(md).toContain('- **Тема?** → Тёмная');
    expect(md).not.toContain('Your questions have been answered');
  });
});
