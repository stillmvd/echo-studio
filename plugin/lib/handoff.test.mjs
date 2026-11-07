import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { handoff, handoffFile, readUsage, usagePath } from './handoff.mjs';

const session = 'handoff-test-session';
const input = (extra = {}) => ({ session_id: session, cwd: dir, ...extra });
let dir;

function setUsage(data) {
  const file = usagePath(session);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(data));
}

function setTokens(tokens, window = 250000) {
  setUsage({ used_pct: Math.round((tokens / window) * 100), size: window, tokens, window });
}

function fresh() {
  dir = mkdtempSync(join(tmpdir(), 'echo-handoff-'));
  writeFileSync(join(dir, 'MEMORY.md'), '');
  return { memory_dir: dir, note_path: null, asked: null, handoff_armed: true };
}

afterEach(() => rmSync(usagePath(session), { force: true }));

describe('readUsage', () => {
  it('reads tokens and window', () => {
    setUsage({ used_pct: 9, size: 1000000, tokens: 95420, window: 250000 });
    expect(readUsage(session)).toEqual({ tokens: 95420, window: 250000, pct: 38 });
  });

  it('falls back to used_pct and size', () => {
    setUsage({ used_pct: 50, size: 200000 });
    expect(readUsage(session)).toEqual({ tokens: 100000, window: 200000, pct: 50 });
  });

  it('returns null without usage', () => {
    expect(readUsage(session)).toBeNull();
    setUsage({ size: 200000 });
    expect(readUsage(session)).toBeNull();
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
  it('stays quiet below window minus 40k and in subagents', () => {
    const state = fresh();
    setTokens(209000);
    expect(handoff(state, input(), 'tool')).toBeNull();
    setTokens(215000);
    expect(handoff(state, input({ agent_id: 'a1' }), 'tool')).toBeNull();
    expect(state.handoff_armed).toBe(true);
  });

  it('fires once at 210k of 250k and writes the instruction', () => {
    const state = fresh();
    setTokens(210000);
    const hint = handoff(state, input(), 'prompt');
    const file = join(dir, '.echo-handoff.txt');
    expect(hint).toContain(file);
    expect(hint).toContain('210k из 250k');
    expect(hint).toContain('этой сессии');
    expect(state.handoff_armed).toBe(false);
    expect(state.asked).not.toBeNull();
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('210k из 250k');
    expect(text).toContain(join(dir, 'HANDOFF.md'));
    expect(text).not.toMatch(/\{\{\w+\}\}/);
    expect(text).not.toContain('Промпт для новой сессии:');
    setTokens(240000);
    expect(handoff(state, input(), 'tool')).toBeNull();
  });

  it('re-arms after compaction drops below half the window', () => {
    const state = fresh();
    setTokens(220000);
    expect(handoff(state, input(), 'tool')).not.toBeNull();
    setTokens(130000);
    expect(handoff(state, input(), 'tool')).toBeNull();
    expect(state.handoff_armed).toBe(false);
    setTokens(60000);
    expect(handoff(state, input(), 'tool')).toBeNull();
    expect(state.handoff_armed).toBe(true);
    setTokens(212000);
    expect(handoff(state, input(), 'tool')).not.toBeNull();
  });

  it('uses used_pct and size when tokens are missing', () => {
    const state = fresh();
    setUsage({ used_pct: 79, size: 200000 });
    expect(handoff(state, input(), 'tool')).toBeNull();
    setUsage({ used_pct: 80, size: 200000 });
    expect(handoff(state, input(), 'tool')).toContain('160k из 200k');
  });
});
