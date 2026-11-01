import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kimiHome } from './agent.mjs';
import { workDir, writeAtomic } from './run.mjs';

export const MARK = 'echo-sync';
const TOP_OPEN = `# >>> ${MARK}: top`;
const TOP_CLOSE = `# <<< ${MARK}: top`;
const HOOKS_OPEN = `# >>> ${MARK}: hooks`;
const HOOKS_CLOSE = `# <<< ${MARK}: hooks`;
const KIMI_EVENTS = new Set([
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'SessionStart',
  'SessionEnd',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'StopFailure',
  'PreCompact',
  'PostCompact',
  'Notification',
]);
const CLAUDE_ONLY = /artifact-open-firefox|subagent-model-guard/;
export const SKILL_DIRS = ['~/.claude/skills', '.claude/skills'];
export const AGENT_DIRS = ['~/.claude/agents', '.claude/agents'];
const GENERATED = `<!-- ${MARK}: создано из Claude Code, правь исходник -->`;

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const hash = (text) => createHash('sha1').update(text).digest('hex').slice(0, 12);
const stripFrontmatter = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
const toml = (value) => JSON.stringify(value);

function writeIfChanged(path, text, changed) {
  if (read(path) === text) return;
  writeAtomic(path, text);
  changed.push(path);
}

export function replaceBlock(text, open, close, body, atTop) {
  const start = text.indexOf(open);
  const end = text.indexOf(close);
  const block = body ? `${open}\n${body.trimEnd()}\n${close}\n` : '';
  if (start >= 0 !== end >= 0 || (start >= 0 && end < start) || text.indexOf(open, start + 1) > 0) {
    throw new Error(`config.toml: маркеры «${open}» повреждены — блок не обновлён`);
  }
  if (start >= 0) {
    const tail = text.slice(end + close.length).replace(/^\r?\n/, '');
    return text.slice(0, start) + block + tail;
  }
  if (!block) return text;
  if (atTop) return `${block}\n${text}`;
  return `${text.replace(/\s*$/, '')}\n\n${block}`;
}

function outsideBlocks(text) {
  return [
    [TOP_OPEN, TOP_CLOSE],
    [HOOKS_OPEN, HOOKS_CLOSE],
  ].reduce((acc, [open, close]) => replaceBlock(acc, open, close, '', false), text);
}

export function hookRules(settings) {
  const rules = [];
  const skipped = [];
  for (const [event, groups] of Object.entries(settings?.hooks ?? {})) {
    for (const group of groups ?? []) {
      for (const hook of group.hooks ?? []) {
        if (hook.type !== 'command' || !hook.command) continue;
        if (!KIMI_EVENTS.has(event) || CLAUDE_ONLY.test(hook.command)) {
          skipped.push(`${event}: ${hook.command}`);
          continue;
        }
        const matcher = group.matcher && group.matcher !== '*' ? group.matcher : null;
        const timeout = Math.min(600, Math.max(1, Number(hook.timeout) || 30));
        rules.push({ event, matcher, command: hook.command, timeout });
      }
    }
  }
  return { rules, skipped };
}

export function hooksBlock(rules) {
  return rules
    .map((r) =>
      [
        '[[hooks]]',
        `event = ${toml(r.event)}`,
        r.matcher ? `matcher = ${toml(`^(${r.matcher})$`)}` : null,
        `command = ${toml(r.command)}`,
        `timeout = ${r.timeout}`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

export function topBlock(config) {
  const all = outsideBlocks(config);
  const table = all.search(/^\s*\[/m);
  const outside = table >= 0 ? all.slice(0, table) : all;
  const lines = [];
  const conflicts = [];
  for (const [key, dirs] of [
    ['extra_skill_dirs', SKILL_DIRS],
    ['extra_agent_dirs', AGENT_DIRS],
  ]) {
    if (new RegExp(`^\\s*${key}\\s*=`, 'm').test(outside)) conflicts.push(key);
    else lines.push(`${key} = ${toml(dirs)}`);
  }
  return { body: lines.join('\n'), conflicts };
}

function walkMarkdown(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walkMarkdown(path, `${prefix}${name}-`));
    else if (name.endsWith('.md')) out.push({ name: `${prefix}${name.slice(0, -3)}`, path });
  }
  return out;
}

export function commandSkill(name, text) {
  const description =
    /^description:\s*(.+)$/m
      .exec(text)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, '') ?? `Команда /${name}`;
  const hint = /^argument-hint:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const body = stripFrontmatter(text)
    .trim()
    .replaceAll('$ARGUMENTS', 'аргументы команды (текст после её имени)');
  const head = [
    '---',
    `name: ${name}`,
    `description: ${toml(description)}`,
    '---',
    '',
    GENERATED,
    '',
  ];
  if (hint) head.push(`Аргументы: ${hint}`, '');
  return `${head.join('\n')}${body}\n`;
}

function syncCommands(claude, kimi, changed) {
  const target = join(kimi, 'skills');
  const wanted = new Map(walkMarkdown(join(claude, 'commands')).map((c) => [c.name, c.path]));
  if (existsSync(target)) {
    for (const name of readdirSync(target)) {
      const file = join(target, name, 'SKILL.md');
      if (!wanted.has(name) && (read(file) ?? '').includes(GENERATED)) {
        rmSync(join(target, name), { recursive: true, force: true });
        changed.push(join(target, name));
      }
    }
  }
  for (const [name, path] of wanted) {
    const file = join(target, name, 'SKILL.md');
    const current = read(file);
    if (current !== null && !current.includes(GENERATED)) continue;
    writeIfChanged(file, commandSkill(name, readFileSync(path, 'utf8')), changed);
  }
  return wanted.size;
}

function instructions(claude) {
  const parts = [];
  const main = read(join(claude, 'CLAUDE.md'));
  if (main) parts.push(main.trim());
  try {
    const style = JSON.parse(read(join(claude, 'settings.json')) ?? '{}').outputStyle;
    const styleText = style ? read(join(claude, 'output-styles', `${style}.md`)) : null;
    if (styleText) parts.push(stripFrontmatter(styleText).trim());
  } catch {}
  return parts.length ? `${GENERATED}\n\n${parts.join('\n\n')}\n` : null;
}

function mcpServers(source) {
  const servers = {};
  for (const [name, s] of Object.entries(source ?? {})) {
    if (!s || typeof s !== 'object') continue;
    const entry = {};
    for (const key of ['command', 'args', 'env', 'cwd', 'url', 'headers'])
      if (s[key] !== undefined) entry[key] = s[key];
    servers[name] = entry;
  }
  return servers;
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function syncGlobal({ home = homedir(), kimi = kimiHome(process.env, home) } = {}) {
  if (!existsSync(kimi)) return null;
  const claude = join(home, '.claude');
  const changed = [];
  const warnings = [];

  const agents = instructions(claude);
  const agentsPath = join(kimi, 'AGENTS.md');
  const agentsNow = read(agentsPath);
  if (agents && agentsNow !== null && !agentsNow.startsWith(GENERATED)) {
    warnings.push(
      '~/.kimi-code/AGENTS.md изменён вручную — не перезаписан; удали его, чтобы вернуть синхронизацию с CLAUDE.md',
    );
  } else if (agents) {
    writeIfChanged(agentsPath, agents, changed);
  }

  let settings = {};
  try {
    settings = JSON.parse(read(join(claude, 'settings.json')) ?? '{}');
  } catch {
    warnings.push('settings.json не читается — хуки не обновлены');
  }
  const configPath = join(kimi, 'config.toml');
  const config = read(configPath) ?? '';
  const { rules, skipped } = hookRules(settings);
  try {
    const { body, conflicts } = topBlock(config);
    for (const key of conflicts)
      warnings.push(
        `${key} уже задан в config.toml вне блока — ~/.claude не подключён, добавь сам`,
      );
    let next = replaceBlock(config, TOP_OPEN, TOP_CLOSE, body, true);
    next = replaceBlock(next, HOOKS_OPEN, HOOKS_CLOSE, hooksBlock(rules), false);
    if (next !== config) {
      if (config && !existsSync(`${configPath}.echo-bak`))
        writeAtomic(`${configPath}.echo-bak`, config);
      writeAtomic(configPath, next);
      changed.push(configPath);
    }
  } catch (error) {
    warnings.push(error.message);
  }

  let mcpOwned;
  try {
    const global = JSON.parse(read(join(home, '.claude.json')) ?? '{}');
    const mcpPath = join(kimi, 'mcp.json');
    const mine = mcpServers(global.mcpServers);
    const status = readStatus(kimi);
    const owned = status.mcpOwned ?? (status.at ? undefined : []);
    const currentMcp = read(mcpPath);
    const merged = mergeMcp(currentMcp, owned, mine);
    const nextMcp = json({ ...merged.rest, mcpServers: merged.servers });
    if (currentMcp && currentMcp !== nextMcp && !existsSync(`${mcpPath}.echo-bak`))
      writeAtomic(`${mcpPath}.echo-bak`, currentMcp);
    writeIfChanged(mcpPath, nextMcp, changed);
    mcpOwned = Object.keys(mine);
    if (merged.kept.length)
      warnings.push(
        `в ~/.kimi-code/mcp.json оставлены свои серверы Kimi: ${merged.kept.join(', ')}`,
      );
  } catch (error) {
    warnings.push(
      error instanceof SyntaxError
        ? '.claude.json или ~/.kimi-code/mcp.json не читается — MCP не обновлены'
        : `MCP не обновлены: ${error.message}`,
    );
  }

  const commands = syncCommands(claude, kimi, changed);
  if (mcpOwned) writeStatus({ mcpOwned }, kimi);
  return { changed, warnings, hooks: rules.length, skippedHooks: skipped, commands };
}

export function mergeMcp(currentText, owned, mine) {
  const current = currentText === null ? {} : JSON.parse(currentText);
  const servers = current.mcpServers ?? {};
  const ownedSet = new Set(owned ?? Object.keys(servers));
  const kept = Object.keys(servers).filter((name) => !ownedSet.has(name) && !(name in mine));
  const { mcpServers: _, ...rest } = current;
  return {
    rest,
    kept,
    servers: { ...Object.fromEntries(kept.map((name) => [name, servers[name]])), ...mine },
  };
}

export function syncProject(root) {
  const changed = [];
  const target = join(root, '.kimi-code');
  const main = read(join(root, 'CLAUDE.md'));
  const local = read(join(root, 'CLAUDE.local.md'));
  const own = existsSync(join(root, 'AGENTS.md'));
  const generated = join(target, 'AGENTS.md');
  if ((own || !(main || local)) && (read(generated) ?? '').startsWith(GENERATED)) {
    rmSync(generated, { force: true });
    changed.push(generated);
  }
  if ((main || local) && !own) {
    const text = `${GENERATED}\n\n${[main, local]
      .filter(Boolean)
      .map((t) => t.trim())
      .join('\n\n')}\n`;
    writeIfChanged(join(target, 'AGENTS.md'), text, changed);
  }
  const mcp = read(join(root, '.mcp.json'));
  if (mcp) {
    try {
      writeIfChanged(
        join(target, 'mcp.json'),
        json({ mcpServers: mcpServers(JSON.parse(mcp).mcpServers) }),
        changed,
      );
    } catch {}
  }
  return changed;
}

export function pluginFingerprint(root) {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      if (name === 'node_modules' || name.endsWith('.test.mjs')) continue;
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else files.push(`${relative(root, path).split(sep).join('/')}:${stat.size}:${stat.mtimeMs}`);
    }
  })(root);
  return hash(files.join('\n'));
}

export const pluginLock = () => join(workDir, 'kimi-plugin.lock');

export function takeLock(now) {
  mkdirSync(workDir, { recursive: true });
  const lock = pluginLock();
  try {
    if (existsSync(lock) && now - statSync(lock).mtimeMs > 120000) rmSync(lock, { force: true });
    closeSync(openSync(lock, 'wx'));
    return true;
  } catch {
    return false;
  }
}

export function statusPath(kimi = kimiHome()) {
  return join(kimi, `${MARK}.json`);
}

export function readStatus(kimi = kimiHome()) {
  try {
    return JSON.parse(readFileSync(statusPath(kimi), 'utf8'));
  } catch {
    return {};
  }
}

export function writeStatus(patch, kimi = kimiHome()) {
  mkdirSync(kimi, { recursive: true });
  writeAtomic(statusPath(kimi), json({ ...readStatus(kimi), ...patch }));
}

export function syncForKimi(
  root,
  { home = homedir(), kimi = kimiHome(process.env, home), install = true } = {},
) {
  const global = syncGlobal({ home, kimi });
  if (!global) return null;
  const project = syncProject(root);
  const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const now = Date.now();
  writeStatus(
    {
      at: new Date(now).toISOString(),
      warnings: global.warnings,
      hooks: global.hooks,
      commands: global.commands,
    },
    kimi,
  );
  const stale = install && readStatus(kimi).plugin?.fingerprint !== pluginFingerprint(plugin);
  if (stale && takeLock(now)) {
    const log = openSync(join(workDir, 'kimi-sync.log'), 'a');
    spawn(process.execPath, [join(plugin, 'bin', 'kimi-sync.mjs'), '--plugin', '--locked'], {
      detached: true,
      stdio: ['ignore', log, log],
      windowsHide: true,
      env: { ...process.env, KIMI_CODE_HOME: kimi },
    }).unref();
  }
  return { global, project, stale };
}

export function projectRoots(base) {
  const roots = [];
  (function walk(dir, depth) {
    if (depth > 3) return;
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    if (names.includes('CLAUDE.md') || names.includes('.mcp.json')) roots.push(dir);
    for (const name of names) {
      if (name.startsWith('.') || name.startsWith('_') || name === 'node_modules') continue;
      const path = join(dir, name);
      try {
        if (statSync(path).isDirectory()) walk(path, depth + 1);
      } catch {}
    }
  })(base, 0);
  return roots.filter((r) => basename(dirname(r)) !== '.claude');
}
