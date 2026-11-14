import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lock, readArchiveStatus, taskScript, writeArchiveStatus } from '../bin/claude-archive.mjs';
import { rebuildConfig } from './kimi-sync.mjs';
import { mirrorMemory } from './migration.mjs';

describe('claude-archive', () => {
  it('lets only one archive run at a time and takes over a stale lock', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-'));
    const path = join(dir, 'a.lock');
    const release = lock(path);
    expect(release).toBeTypeOf('function');
    expect(lock(path)).toBeNull();
    const old = (Date.now() - 4 * 3600e3) / 1000;
    utimesSync(path, old, old);
    expect(lock(path)).toBeTypeOf('function');
  });

  it('quotes apostrophes for PowerShell', () => {
    const ps = taskScript("C:\\Users\\O'Neil\\node.exe", 'C:\\Пути с пробелом\\a.mjs');
    expect(ps).toContain(
      `-Argument '--headless "C:\\Users\\O''Neil\\node.exe" "C:\\Пути с пробелом\\a.mjs"'`,
    );
  });

  it('keeps its status in a file of its own', () => {
    const kimi = mkdtempSync(join(tmpdir(), 'arc-'));
    writeArchiveStatus({ task: { script: 'a' } }, kimi);
    writeArchiveStatus({ archive: { size: 1 } }, kimi);
    expect(readArchiveStatus(kimi)).toEqual({ task: { script: 'a' }, archive: { size: 1 } });
  });
});

describe('edge cases', () => {
  it('does not wipe a project copy while its memory folder has no .md', () => {
    const root = mkdtempSync(join(tmpdir(), 'mig-'));
    const projects = join(root, 'projects');
    const target = join(root, 'memory');
    mkdirSync(join(projects, 'P1', 'memory'), { recursive: true });
    mkdirSync(join(target, 'P1'), { recursive: true });
    writeFileSync(join(target, 'P1', 'MEMORY.md'), 'old');
    expect(mirrorMemory(projects, target)).toBeNull();
    mkdirSync(join(projects, 'P2', 'memory'), { recursive: true });
    writeFileSync(join(projects, 'P2', 'memory', 'MEMORY.md'), 'x');
    expect(mirrorMemory(projects, target)).toMatchObject({ projects: 1 });
    expect(readArchiveStatus(join(root, 'none'))).toEqual({});
  });

  it('keeps CRLF line endings of config.toml', () => {
    const config = 'default_model = "k"\r\n\r\n[[hooks]]\r\nevent = "Stop"\r\ncommand = "mine"\r\n';
    const rules = [{ event: 'Stop', matcher: null, command: 'node a.mjs', timeout: 30 }];
    const { text } = rebuildConfig(config, rules);
    expect(text).toContain('command = "mine"\r\n');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });
});
