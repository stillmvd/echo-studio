import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATION, mirror, mirrorMemory, refreshMigration, THROTTLE_MS } from './migration.mjs';

function put(path, text) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

describe('mirror', () => {
  it('copies changes and removes what is gone', () => {
    const root = mkdtempSync(join(tmpdir(), 'mig-'));
    const src = join(root, 'src');
    const dst = join(root, 'dst');
    put(join(src, 'a.md'), 'a');
    put(join(src, 'sub', 'b.md'), 'b');
    put(join(dst, 'old.md'), 'old');
    expect(mirror(src, dst)).toEqual({ copied: 2, removed: 1, files: 2 });
    expect(mirror(src, dst)).toEqual({ copied: 0, removed: 0, files: 2 });
    expect(readFileSync(join(dst, 'sub', 'b.md'), 'utf8')).toBe('b');
  });
});

describe('mirrorMemory', () => {
  it('keeps only .md and never wipes the copy when the source is empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'mig-'));
    const projects = join(root, 'projects');
    const target = join(root, 'memory');
    put(join(projects, 'P1', 'memory', 'MEMORY.md'), '- x');
    put(join(projects, 'P1', 'memory', '.echo-handoff.txt'), 'служебное');
    put(join(projects, 'P1', 's.jsonl'), '{}');
    put(join(target, 'Gone', 'MEMORY.md'), 'old');
    expect(mirrorMemory(projects, target)).toMatchObject({ projects: 1, files: 1 });
    expect(existsSync(join(target, 'P1', '.echo-handoff.txt'))).toBe(false);
    expect(existsSync(join(target, 'Gone'))).toBe(false);
    expect(mirrorMemory(join(root, 'nothing'), target)).toBeNull();
    expect(existsSync(join(target, 'P1', 'MEMORY.md'))).toBe(true);
  });
});

describe('refreshMigration', () => {
  it('writes README and the plan only when the folder exists, not more often than the throttle', () => {
    const home = mkdtempSync(join(tmpdir(), 'mig-'));
    const kimi = join(home, '.kimi-code');
    expect(refreshMigration({ home, kimi, plugin: 'C:/plug' })).toBeNull();
    mkdirSync(join(home, MIGRATION));
    put(join(home, '.claude', 'projects', 'P1', 'memory', 'MEMORY.md'), '- x');
    const now = Date.now();
    const first = refreshMigration({ home, kimi, plugin: 'C:/plug', now });
    expect(first.memory.files).toBe(1);
    const plan = readFileSync(join(home, MIGRATION, 'ПЕРЕЕЗД.md'), 'utf8');
    expect(plan).toContain('node "C:/plug/bin/kimi-sync.mjs" --all');
    expect(plan).toContain('--agent kimi');
    expect(readFileSync(join(home, MIGRATION, 'README.md'), 'utf8')).toContain('1 проект,');
    const status = { migration: first };
    expect(refreshMigration({ home, kimi, plugin: 'C:/plug', status, now: now + 1000 })).toBeNull();
    expect(
      refreshMigration({ home, kimi, plugin: 'C:/plug', status, now: now + THROTTLE_MS + 1 }),
    ).not.toBeNull();
  });
});
