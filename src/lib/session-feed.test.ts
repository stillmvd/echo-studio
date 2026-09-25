import { describe, expect, it } from 'vitest';
import { buildFeed, isHideableSystemKind, nodeText, pairTools } from './session-feed';
import type { DisplayItem } from './types';

let n = 0;
function item(
  kind: string,
  text: string | null = null,
  extra: Partial<DisplayItem> = {},
): DisplayItem {
  n += 1;
  return {
    uuid: `u${n}`,
    parentUuid: null,
    timestamp: '2026-09-23T11:03:41.660Z',
    kind,
    role: kind.startsWith('user') ? 'user' : 'assistant',
    text,
    toolName: null,
    toolInputSummary: null,
    toolInputJson: null,
    isError: null,
    raw: null,
    ...extra,
  };
}

describe('buildFeed', () => {
  it('turns local commands into pills and hides caveats', () => {
    const feed = buildFeed([
      item('user_text', '<local-command-caveat>Caveat: …</local-command-caveat>'),
      item(
        'user_text',
        '<command-name>/model</command-name>\n<command-message>model</command-message>',
      ),
      item('user_text', '<local-command-stdout>Set model to `Opus 5.5`</local-command-stdout>'),
    ]);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      type: 'command',
      name: '/model',
      output: 'Set model to `Opus 5.5`',
    });
  });

  it('splits pasted content from the message and detects skills', () => {
    const feed = buildFeed([
      item('user_text', 'look\n<pasted_content id="1">line 1\nline 2</pasted_content>'),
      item(
        'user_text',
        'Base directory for this skill: C:\\Users\\me\\.claude\\skills\\mark-ship\n\n# Mark Ship',
      ),
    ]);
    expect(feed[0]).toMatchObject({ type: 'message', text: 'look', paste: 'line 1\nline 2' });
    expect(feed[1]).toMatchObject({ type: 'skill', name: 'mark-ship', text: '# Mark Ship' });
  });

  it('marks thought answers, attaches turn time and keeps recaps', () => {
    const feed = buildFeed([
      item('user_text', 'кеш старый остался'),
      item('thinking', ''),
      item('assistant_text', 'Чищу.'),
      item('system_turn_duration', 'turn took 32586 ms'),
      item('system_away_summary', 'Сделано. (disable recaps in /config)'),
    ]);
    expect(feed[1]).toMatchObject({ type: 'message', thought: true, turnMs: 32586 });
    expect(feed[2]).toEqual({ type: 'recap', key: expect.any(String), text: 'Сделано.' });
  });

  it('groups consecutive tool calls into one run', () => {
    const feed = buildFeed([
      item('tool_use', null, { toolName: 'Read' }),
      item('tool_result', 'ok'),
      item('assistant_text', 'done'),
    ]);
    expect(feed.map((f) => f.type)).toEqual(['tools', 'message']);
  });
});

describe('pairTools', () => {
  it('pairs results with their calls by parent uuid', () => {
    const a = item('tool_use', null, { uuid: 'a:0', toolName: 'PowerShell' });
    const b = item('tool_use', null, { uuid: 'b:0', toolName: 'Read' });
    const rb = item('tool_result', 'png', { parentUuid: 'b' });
    const ra = item('tool_result', '0.3.2', { parentUuid: 'a' });
    const steps = pairTools([a, b, rb, ra]);
    expect(steps.map((s) => [s.use?.toolName, s.result?.text])).toEqual([
      ['PowerShell', '0.3.2'],
      ['Read', 'png'],
    ]);
  });
});

describe('isHideableSystemKind', () => {
  it('keeps turn markers visible', () => {
    expect(isHideableSystemKind('system_turn_duration')).toBe(false);
    expect(isHideableSystemKind('system_stop_hook_summary')).toBe(true);
    expect(isHideableSystemKind('meta_mode')).toBe(true);
  });
});

describe('nodeText', () => {
  it('searches a whole tool run and a command with its output', () => {
    const [tools, command] = buildFeed([
      item('tool_use', null, { toolName: 'PowerShell', toolInputSummary: 'Get-Item' }),
      item('tool_result', 'Иконка обновлена'),
      item('user_text', '<command-name>/model</command-name>'),
      item('user_text', '<local-command-stdout>Set model</local-command-stdout>'),
    ]);
    expect(tools && nodeText(tools)).toContain('иконка');
    expect(command && nodeText(command)).toBe('/model set model');
  });
});
