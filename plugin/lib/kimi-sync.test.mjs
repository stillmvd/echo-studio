import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  commandSkill,
  hookRules,
  hooksBlock,
  replaceBlock,
  syncGlobal,
  syncProject,
  topBlock,
} from './kimi-sync.mjs';

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'echo-sync-'));
  const claude = join(home, '.claude');
  const kimi = join(home, '.kimi-code');
  mkdirSync(join(claude, 'commands', 'phase'), { recursive: true });
  mkdirSync(join(claude, 'output-styles'), { recursive: true });
  mkdirSync(kimi, { recursive: true });
  writeFileSync(join(claude, 'CLAUDE.md'), '# Правила\nОтвечай на русском.\n');
  writeFileSync(join(claude, 'output-styles', 'mine.md'), '---\nname: mine\n---\nКоротко.\n');
  writeFileSync(
    join(claude, 'settings.json'),
    JSON.stringify({
      outputStyle: 'mine',
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'node "C:/h/heredoc-guard.js"', timeout: 5 }],
          },
          {
            matcher: 'Agent|Task',
            hooks: [{ type: 'command', command: 'node C:/h/subagent-model-guard.js' }],
          },
        ],
        PostToolUse: [
          {
            matcher: 'Artifact',
            hooks: [{ type: 'command', command: 'node C:/h/artifact-open-firefox.js' }],
          },
        ],
        SessionStart: [{ hooks: [{ type: 'command', command: 'node C:/h/status.js' }] }],
      },
    }),
  );
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({ mcpServers: { cdp: { type: 'stdio', command: 'npx', args: ['x@1'] } } }),
  );
  writeFileSync(
    join(claude, 'commands', 'phase', 'next.md'),
    '---\ndescription: Следующая фаза\n---\nВозьми фазу $ARGUMENTS.\n',
  );
  writeFileSync(join(kimi, 'config.toml'), 'default_model = "k3"\n\n[thinking]\nenabled = true\n');
  return { home, claude, kimi };
}

describe('replaceBlock', () => {
  it('inserts once and replaces in place', () => {
    const once = replaceBlock('a = 1\n', '# >', '# <', 'b = 2', true);
    expect(once).toBe('# >\nb = 2\n# <\n\na = 1\n');
    expect(replaceBlock(once, '# >', '# <', 'b = 3', true)).toBe('# >\nb = 3\n# <\n\na = 1\n');
  });
});

describe('hooks', () => {
  it('keeps portable hooks, anchors matchers and drops Claude-only ones', () => {
    const { rules, skipped } = hookRules({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash|PowerShell',
            hooks: [{ type: 'command', command: 'node g.js', timeout: 999 }],
          },
        ],
        PostToolUse: [
          {
            matcher: 'Artifact',
            hooks: [{ type: 'command', command: 'node artifact-open-firefox.js' }],
          },
        ],
        Elicitation: [{ hooks: [{ type: 'command', command: 'node e.js' }] }],
      },
    });
    expect(rules).toEqual([
      { event: 'PreToolUse', matcher: 'Bash|PowerShell', command: 'node g.js', timeout: 600 },
    ]);
    expect(skipped).toHaveLength(2);
    expect(hooksBlock(rules)).toContain('matcher = "^(Bash|PowerShell)$"');
  });

  it('leaves user extra dirs alone', () => {
    const { body, conflicts } = topBlock('extra_skill_dirs = ["~/team"]\n');
    expect(conflicts).toEqual(['extra_skill_dirs']);
    expect(body).toContain('extra_agent_dirs');
    expect(body).not.toContain('extra_skill_dirs');
  });
});

describe('commandSkill', () => {
  it('turns a command into a skill', () => {
    const text = commandSkill(
      'phase-next',
      '---\ndescription: Следующая фаза\n---\nВозьми $ARGUMENTS.\n',
    );
    expect(text).toMatch(/^---\nname: phase-next\ndescription: "Следующая фаза"\n---/);
    expect(text).not.toContain('$ARGUMENTS');
  });
});

describe('syncGlobal', () => {
  it('writes Kimi files and is idempotent', () => {
    const { home, kimi } = fixture();
    const first = syncGlobal({ home, kimi });
    expect(first.changed.length).toBeGreaterThan(0);
    expect(syncGlobal({ home, kimi }).changed).toEqual([]);
    const config = readFileSync(join(kimi, 'config.toml'), 'utf8');
    expect(config.indexOf('extra_skill_dirs')).toBeLessThan(config.indexOf('[thinking]'));
    expect(config).toContain('heredoc-guard');
    expect(config).not.toContain('subagent-model-guard');
    expect(config).not.toContain('artifact-open-firefox');
    expect(readFileSync(join(kimi, 'AGENTS.md'), 'utf8')).toContain('Коротко.');
    expect(JSON.parse(readFileSync(join(kimi, 'mcp.json'), 'utf8')).mcpServers.cdp).toEqual({
      command: 'npx',
      args: ['x@1'],
    });
    expect(readFileSync(join(kimi, 'skills', 'phase-next', 'SKILL.md'), 'utf8')).toContain(
      'Следующая фаза',
    );
  });

  it('does not overwrite a hand-made skill and removes stale generated ones', () => {
    const { home, claude, kimi } = fixture();
    mkdirSync(join(kimi, 'skills', 'phase-next'), { recursive: true });
    writeFileSync(join(kimi, 'skills', 'phase-next', 'SKILL.md'), 'моё');
    syncGlobal({ home, kimi });
    expect(readFileSync(join(kimi, 'skills', 'phase-next', 'SKILL.md'), 'utf8')).toBe('моё');
    writeFileSync(join(claude, 'commands', 'old.md'), 'x');
    syncGlobal({ home, kimi });
    expect(existsSync(join(kimi, 'skills', 'old'))).toBe(true);
    rmSync(join(claude, 'commands', 'old.md'));
    syncGlobal({ home, kimi });
    expect(existsSync(join(kimi, 'skills', 'old'))).toBe(false);
    expect(existsSync(join(kimi, 'skills', 'phase-next'))).toBe(true);
  });

  it('skips when Kimi is not installed', () => {
    const { home } = fixture();
    expect(syncGlobal({ home, kimi: join(home, 'nope') })).toBeNull();
  });
});

describe('syncProject', () => {
  it('mirrors CLAUDE.md and .mcp.json unless the project has its own AGENTS.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'echo-proj-'));
    writeFileSync(join(root, 'CLAUDE.md'), '# Проект\n');
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({ mcpServers: { a: { command: 'npx' } } }),
    );
    expect(syncProject(root)).toHaveLength(2);
    expect(syncProject(root)).toEqual([]);
    expect(readFileSync(join(root, '.kimi-code', 'AGENTS.md'), 'utf8')).toContain('# Проект');
    const own = mkdtempSync(join(tmpdir(), 'echo-proj-'));
    writeFileSync(join(own, 'CLAUDE.md'), 'x');
    writeFileSync(join(own, 'AGENTS.md'), 'y');
    expect(syncProject(own)).toEqual([]);
  });
});
