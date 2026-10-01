import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ask } from './ask.mjs';

describe('ask', () => {
  it('writes the instruction and marks the turn as asked', () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-ask-'));
    writeFileSync(join(dir, 'MEMORY.md'), '');
    writeFileSync(join(dir, 'old.md'), '');
    const state = { memory_dir: dir, note_path: null, asked: null };
    const now = new Date(2026, 9, 1, 12, 0);
    const hint = ask(state, 'ab12cd34-ffff', now);
    const file = join(dir, '.echo-summary.txt');
    expect(hint).toContain(file);
    expect(state.asked).toBe(now.getTime());
    expect(state.note_path).toBe(join(dir, 'sessions', '2026-10-01_ab12cd34.md'));
    expect(state.records_before).toEqual(['old.md']);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain(state.note_path);
    expect(text).toContain('name: session-ab12cd34');
    expect(text).not.toMatch(/\{\{\w+\}\}/);
  });
});
