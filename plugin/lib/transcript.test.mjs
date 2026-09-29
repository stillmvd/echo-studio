import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSince, tally } from './transcript.mjs';

const base = { user_count: 0, edited: false, first_prompt: null, touched: [], recent: [] };
const user = (content, extra = {}) => ({
  type: 'user',
  message: { role: 'user', content },
  ...extra,
});
const assistant = (content) => ({ type: 'assistant', message: { role: 'assistant', content } });
const jsonl = (entries) => `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`;

describe('readSince', () => {
  it('reads new complete lines from offset and skips broken ones', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'tr-')), 's.jsonl');
    writeFileSync(file, `${jsonl([user('a')])}{broken\n`);
    const first = readSince(file, 0);
    expect(first.entries).toHaveLength(1);
    appendFileSync(file, `${JSON.stringify(user('b'))}\n{"partial":`);
    const second = readSince(file, first.offset);
    expect(second.entries.map((e) => e.message.content)).toEqual(['b']);
    expect(readSince(file, second.offset).entries).toEqual([]);
  });

  it('restarts when the file shrank', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'tr-')), 's.jsonl');
    writeFileSync(file, jsonl([user('a')]));
    expect(readSince(file, 10_000).entries).toHaveLength(1);
  });
});

describe('tally', () => {
  it('counts real user prompts only', () => {
    const { state } = tally(
      [
        user('первый запрос'),
        user([{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }]),
        user('Stop hook feedback:\nx', { isMeta: true }),
        user('<local-command-stdout>ok</local-command-stdout>'),
        user('side', { isSidechain: true }),
        user([{ type: 'text', text: 'второй' }]),
      ],
      base,
    );
    expect(state.user_count).toBe(2);
    expect(state.first_prompt).toBe('первый запрос');
  });

  it('detects edits, touched files and recent replies', () => {
    const { state } = tally(
      [
        assistant([
          { type: 'text', text: 'правлю' },
          { type: 'tool_use', name: 'Edit', input: { file_path: 'C:/p/a.ts' } },
          { type: 'tool_use', name: 'Read', input: { file_path: 'C:/p/b.ts' } },
          { type: 'tool_use', name: 'Write', input: { file_path: 'C:/p/a.ts' } },
        ]),
      ],
      base,
    );
    expect(state.edited).toBe(true);
    expect(state.touched).toEqual(['C:/p/a.ts']);
    expect(state.recent).toEqual([{ role: 'assistant', text: 'правлю' }]);
  });

  it('detects /remember in both forms', () => {
    const cmd = (name) =>
      user(`<command-message>${name}</command-message>\n<command-name>/${name}</command-name>`);
    expect(tally([cmd('echo-memory:remember')], base).remember).toBe(true);
    expect(tally([cmd('remember')], base).remember).toBe(true);
    expect(tally([cmd('rememberx')], base).remember).toBe(false);
  });

  it('keeps the last 3 replies trimmed to 500 chars', () => {
    const { state } = tally(
      ['1', '2', '3', 'x'.repeat(900)].map((t) => user(t)),
      base,
    );
    expect(state.recent.map((r) => r.text.length)).toEqual([1, 1, 500]);
  });
});
