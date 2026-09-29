import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { notePath, shouldBlock } from './decide.mjs';

const state = (over = {}) => ({ user_count: 0, edited: false, noted_at: null, ...over });
const quiet = { stopHookActive: false, remember: false };

describe('shouldBlock', () => {
  it('blocks after the first edit', () => {
    expect(shouldBlock(state({ user_count: 1, edited: true }), quiet)).toBe(true);
  });

  it('needs 8 user messages without edits', () => {
    expect(shouldBlock(state({ user_count: 7 }), quiet)).toBe(false);
    expect(shouldBlock(state({ user_count: 8 }), quiet)).toBe(true);
  });

  it('repeats no more often than every 15 messages', () => {
    expect(shouldBlock(state({ user_count: 16, edited: true, noted_at: 2 }), quiet)).toBe(false);
    expect(shouldBlock(state({ user_count: 17, edited: true, noted_at: 2 }), quiet)).toBe(true);
  });

  it('never blocks while the stop hook is active', () => {
    const s = state({ user_count: 30, edited: true });
    expect(shouldBlock(s, { stopHookActive: true, remember: true })).toBe(false);
  });

  it('blocks on /remember in a short session', () => {
    expect(shouldBlock(state({ user_count: 1 }), { stopHookActive: false, remember: true })).toBe(
      true,
    );
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
