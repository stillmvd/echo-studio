import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handoff, handoffFile, nextThreshold, usagePath } from './handoff.mjs';

const session = 'handoff-test-session';

function setUsage(pct) {
  const file = usagePath(session);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify({ used_pct: pct, size: 200000 }));
}

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'echo-handoff-'));
  writeFileSync(join(dir, 'MEMORY.md'), '');
  return { dir, state: { memory_dir: dir, note_path: null, asked: null, handoff_next: 50 } };
}

afterEach(() => rmSync(usagePath(session), { force: true }));

describe('nextThreshold', () => {
  it('steps by 15 past the current usage', () => {
    expect(nextThreshold(50)).toBe(65);
    expect(nextThreshold(70)).toBe(80);
    expect(nextThreshold(40)).toBe(50);
  });
});

describe('handoffFile', () => {
  it('prefers an existing file, root by default', () => {
    const root = mkdtempSync(join(tmpdir(), 'echo-root-'));
    expect(handoffFile(root)).toBe(join(root, 'HANDOFF.md'));
    mkdirSync(join(root, '.planning'));
    writeFileSync(join(root, '.planning', 'HANDOFF.md'), '');
    expect(handoffFile(root)).toBe(join(root, '.planning', 'HANDOFF.md'));
  });
});

describe('handoff', () => {
  it('stays quiet below the threshold and in subagents', () => {
    const { dir, state } = fresh();
    setUsage(49);
    expect(handoff(state, { session_id: session, cwd: dir }, 'tool')).toBeNull();
    setUsage(55);
    expect(handoff(state, { session_id: session, cwd: dir, agent_id: 'a1' }, 'tool')).toBeNull();
    expect(state.handoff_next).toBe(50);
  });

  it('writes the instruction, asks for the summary and moves the threshold', () => {
    const { dir, state } = fresh();
    setUsage(52);
    const hint = handoff(state, { session_id: session, cwd: dir }, 'prompt');
    const file = join(dir, '.echo-handoff.txt');
    expect(hint).toContain(file);
    expect(state.handoff_next).toBe(65);
    expect(state.asked).not.toBeNull();
    expect(state.handoff_asked).not.toBeNull();
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('52%');
    expect(text).toContain(join(dir, 'HANDOFF.md'));
    expect(text).not.toMatch(/\{\{\w+\}\}/);
    expect(handoff(state, { session_id: session, cwd: dir }, 'tool')).toBeNull();
  });
});
