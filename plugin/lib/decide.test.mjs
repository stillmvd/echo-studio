import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDue, notePath } from './decide.mjs';

const state = (over = {}) => ({
  user_count: 0,
  edited: false,
  noted_at: null,
  asked: null,
  ...over,
});

describe('isDue', () => {
  it('asks on the first edit', () => {
    expect(isDue(state({ user_count: 1 }), { editing: true })).toBe(true);
    expect(isDue(state({ user_count: 1, edited: true }), { prompting: true })).toBe(true);
  });

  it('needs 8 user messages without edits, counting the current prompt', () => {
    expect(isDue(state({ user_count: 6 }), { prompting: true })).toBe(false);
    expect(isDue(state({ user_count: 7 }), { prompting: true })).toBe(true);
    expect(isDue(state({ user_count: 7 }))).toBe(false);
  });

  it('repeats no more often than every 15 messages', () => {
    expect(isDue(state({ user_count: 16, edited: true, noted_at: 3 }), { prompting: true })).toBe(
      false,
    );
    expect(isDue(state({ user_count: 16, edited: true, noted_at: 2 }), { prompting: true })).toBe(
      true,
    );
  });

  it('asks once per turn', () => {
    const s = state({ user_count: 30, edited: true, asked: 1 });
    expect(isDue(s, { editing: true, remember: true })).toBe(false);
  });

  it('asks on /remember in a short session', () => {
    expect(isDue(state({ user_count: 1 }), { prompting: true, remember: true })).toBe(true);
  });
});

describe('notePath', () => {
  it('uses the session prefix and keeps the first path', () => {
    const now = new Date(2026, 8, 29, 23, 59);
    const first = notePath({ note_path: null }, 'M', 'ab12cd34-ffff', now);
    expect(first).toBe(join('M', 'sessions', '2026-09-29_ab12cd34.md'));
    expect(notePath({ note_path: first }, 'M', 'ab12cd34-ffff', new Date(2026, 8, 30))).toBe(first);
  });
});
