import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromKimi, kimiAfter, kimiBefore, kimiWire, normalize, takePending } from './agent.mjs';
import { tally } from './transcript.mjs';

const sid = () => `session_test_${Math.random().toString(36).slice(2)}`;
const kimi = (over = {}) => ({
  client_type: 'kimi_code_cli',
  cwd: 'C:\\proj',
  session_id: sid(),
  ...over,
});

describe('normalize', () => {
  it('leaves Claude input untouched', () => {
    const input = { session_id: 'a', tool_input: { file_path: 'x' }, prompt: 'hi' };
    expect(normalize(input)).toBe(input);
  });

  it('turns Kimi prompt parts into text and relative path into file_path', () => {
    const out = normalize(
      kimi({
        prompt: [{ type: 'text', text: 'one' }, { type: 'image' }, { type: 'text', text: 'two' }],
        tool_input: { path: 'src/a.ts', content: 'x' },
      }),
      join(tmpdir(), 'no-kimi-home'),
    );
    expect(out.prompt).toBe('one\ntwo');
    expect(out.tool_input.file_path).toBe(resolve('C:\\proj', 'src/a.ts'));
    expect(out.transcript_path).toBeNull();
  });

  it('finds wire.jsonl by session id', () => {
    const root = mkdtempSync(join(tmpdir(), 'kimi-home-'));
    const dir = join(root, 'sessions', 'wd_proj_1', 'session_x', 'agents', 'main');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'wire.jsonl'), '');
    expect(kimiWire('session_x', root)).toBe(join(dir, 'wire.jsonl'));
    expect(kimiWire('session_y', root)).toBeNull();
  });
});

describe('fromKimi', () => {
  const records = [
    { type: 'metadata', protocol_version: '1.5' },
    {
      type: 'context.append_message',
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '<hook_result hook_event="UserPromptSubmit">\nmemo\n</hook_result>',
          },
          { type: 'text', text: 'Почини вход' },
        ],
      },
    },
    {
      type: 'context.append_message',
      message: {
        role: 'user',
        content: [{ type: 'text', text: '<system-reminder>\nx\n</system-reminder>' }],
      },
    },
    {
      type: 'context.append_loop_event',
      event: { type: 'content.part', part: { type: 'think', think: 'hm' } },
    },
    {
      type: 'context.append_loop_event',
      event: {
        type: 'tool.call',
        name: 'Edit',
        args: { path: 'src/login.ts', old_string: 'a', new_string: 'b' },
      },
    },
    {
      type: 'context.append_loop_event',
      event: { type: 'tool.call', name: 'Bash', args: { command: 'ls' } },
    },
    {
      type: 'context.append_loop_event',
      event: { type: 'content.part', part: { type: 'text', text: 'Готово' } },
    },
  ];

  it('keeps real prompts, edits and replies and drops service text', () => {
    const { state } = tally(fromKimi(records, 'C:\\proj'), {
      user_count: 0,
      edited: false,
      first_prompt: null,
      touched: [],
      recent: [],
    });
    expect(state.user_count).toBe(1);
    expect(state.first_prompt).toBe('Почини вход');
    expect(state.edited).toBe(true);
    expect(state.touched).toEqual([resolve('C:\\proj', 'src/login.ts')]);
    expect(state.recent.map((r) => r.role)).toEqual(['user', 'assistant']);
  });
});

describe('pending context', () => {
  it('queues context from silent events and hands it over on the next prompt', () => {
    const input = kimi({ hook_event_name: 'SessionStart' });
    expect(kimiAfter(input, { hookSpecificOutput: { additionalContext: 'memory' } })).toBeNull();
    const prompt = { ...input, hook_event_name: 'UserPromptSubmit' };
    expect(kimiAfter(prompt, { hookSpecificOutput: { additionalContext: 'ask' } })).toBe(
      'memory\n\nask',
    );
    expect(kimiAfter(prompt, null)).toBeNull();
  });

  it('does not queue context from Stop and clears the queue at SessionEnd', () => {
    const input = kimi({ hook_event_name: 'Stop' });
    expect(kimiAfter(input, { hookSpecificOutput: { additionalContext: 'late' } })).toBeNull();
    expect(takePending(input.session_id)).toEqual([]);
    kimiAfter(
      { ...input, hook_event_name: 'PostToolUse' },
      { hookSpecificOutput: { additionalContext: 'x' } },
    );
    kimiAfter({ ...input, hook_event_name: 'SessionEnd' }, null);
    expect(takePending(input.session_id)).toEqual([]);
  });

  it('blocks Stop once with queued context', () => {
    const input = kimi({ hook_event_name: 'PostToolUse' });
    kimiAfter(input, { hookSpecificOutput: { additionalContext: 'save the note' } });
    const stop = { ...input, hook_event_name: 'Stop', stop_hook_active: false };
    expect(kimiBefore({ ...stop, stop_hook_active: true })).toBeNull();
    expect(kimiBefore(stop)).toBe('save the note');
    expect(kimiBefore(stop)).toBeNull();
    expect(takePending(input.session_id)).toEqual([]);
  });
});
