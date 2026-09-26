import { describe, expect, it } from 'vitest';
import { parseAgentNotice } from './agent-notice';
import type { DisplayItem } from './types';

function user(text: string, origin?: string): DisplayItem {
  return {
    uuid: 'u',
    parentUuid: null,
    timestamp: null,
    kind: 'user_text',
    role: 'user',
    text,
    toolName: null,
    toolInputSummary: null,
    toolInputJson: null,
    isError: null,
    raw: origin ? { type: 'user', origin: { kind: origin } } : { type: 'user' },
  };
}

const AGENT = `<task-notification>
<task-id>a1</task-id>
<status>completed</status>
<summary>Agent "Extract promo logic" finished</summary>
<result>## Report

Done.</result>
</task-notification>`;

describe('parseAgentNotice', () => {
  it('reads an agent report marked by origin', () => {
    expect(parseAgentNotice(user(AGENT, 'task-notification'))).toEqual({
      source: 'agent',
      name: 'Extract promo logic',
      summary: 'Agent "Extract promo logic" finished',
      status: 'completed',
      result: '## Report\n\nDone.',
    });
  });

  it('falls back to the text prefix in old logs', () => {
    expect(parseAgentNotice(user(AGENT))?.source).toBe('agent');
  });

  it('ignores human messages even if they quote the markup', () => {
    expect(parseAgentNotice(user(AGENT, 'human'))).toBeNull();
    expect(parseAgentNotice(user('hello'))).toBeNull();
  });

  it('reads background commands without a result', () => {
    const n = parseAgentNotice(
      user(
        '<task-notification>\n<status>failed</status>\n<summary>Background command "Build" failed with exit code 1</summary>\n</task-notification>',
        'task-notification',
      ),
    );
    expect(n).toMatchObject({ source: 'command', name: 'Build', status: 'failed', result: null });
  });

  it('returns null for broken markup', () => {
    expect(parseAgentNotice(user('<task-notification> oops'))).toBeNull();
  });
});
