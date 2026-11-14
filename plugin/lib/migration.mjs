import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { kimiHome } from './agent.mjs';
import { planText, readmeText } from './migration-docs.mjs';
import { writeAtomic } from './run.mjs';

export const MIGRATION = 'Kimi Migration';
export const THROTTLE_MS = 30 * 60 * 1000;

const SKIP_DIRS = new Set(['node_modules', '.git']);

const statOf = (path) => {
  try {
    return statSync(path);
  } catch {
    return null;
  }
};

export function mirror(src, dst, keep = () => true) {
  let copied = 0;
  let removed = 0;
  const seen = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const from = join(dir, name);
      const stat = statOf(from);
      if (!stat) continue;
      const rel = relative(src, from);
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(from);
        continue;
      }
      if (!keep(rel)) continue;
      seen.add(rel.toLowerCase());
      const to = join(dst, rel);
      const now = statOf(to);
      if (now && now.size === stat.size && Math.abs(now.mtimeMs - stat.mtimeMs) < 2000) continue;
      mkdirSync(join(to, '..'), { recursive: true });
      try {
        copyFileSync(from, to);
        utimesSync(to, stat.atime, stat.mtime);
        copied += 1;
      } catch {}
    }
  };
  walk(src);
  const sweep = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statOf(path)?.isDirectory()) {
        sweep(path);
        if (!readdirSync(path).length) rmSync(path, { recursive: true, force: true });
      } else if (!seen.has(relative(dst, path).toLowerCase())) {
        rmSync(path, { force: true });
        removed += 1;
      }
    }
  };
  sweep(dst);
  return { copied, removed, files: seen.size };
}

function memoryDirs(projects) {
  if (!existsSync(projects)) return [];
  return readdirSync(projects)
    .map((slug) => ({ slug, dir: join(projects, slug, 'memory') }))
    .filter(({ dir }) => existsSync(dir) && statSync(dir).isDirectory());
}

const hasMd = (dir) => {
  try {
    return readdirSync(dir, { recursive: true }).some((n) => String(n).endsWith('.md'));
  } catch {
    return false;
  }
};

export function mirrorMemory(projects, target) {
  const all = memoryDirs(projects);
  const dirs = all.filter(({ dir }) => hasMd(dir));
  if (!dirs.length) return null;
  let copied = 0;
  let removed = 0;
  let files = 0;
  const slugs = new Set(all.map((d) => d.slug.toLowerCase()));
  for (const { slug, dir } of dirs) {
    const r = mirror(dir, join(target, slug), (rel) => rel.endsWith('.md'));
    copied += r.copied;
    removed += r.removed;
    files += r.files;
  }
  for (const name of existsSync(target) ? readdirSync(target) : []) {
    if (!slugs.has(name.toLowerCase())) {
      rmSync(join(target, name), { recursive: true, force: true });
      removed += 1;
    }
  }
  return { projects: dirs.length, files, copied, removed };
}

const version = (plugin) => {
  try {
    return JSON.parse(readFileSync(join(plugin, 'kimi.plugin.json'), 'utf8')).version;
  } catch {
    return null;
  }
};

export function refreshMigration({
  home = homedir(),
  kimi = kimiHome(process.env, home),
  plugin,
  status = {},
  now = Date.now(),
  force = false,
} = {}) {
  const dir = join(home, MIGRATION);
  if (!existsSync(dir)) return null;
  const last = Date.parse(status.migration?.at ?? '');
  if (!force && now - last < THROTTLE_MS) return null;
  const claude = join(home, '.claude');
  const memory = mirrorMemory(join(claude, 'projects'), join(dir, 'memory'));
  const hooks = existsSync(join(claude, 'hooks'))
    ? mirror(join(claude, 'hooks'), join(dir, 'hooks'))
    : null;
  const managed = join(kimi, 'plugins', 'managed', 'echo-memory');
  const facts = {
    home: home.replaceAll('\\', '/'),
    plugin: (existsSync(managed) ? managed : plugin).replaceAll('\\', '/'),
    version: version(plugin),
    memory,
    archive: existsSync(join(dir, 'claude-home.tar.gz'))
      ? statSync(join(dir, 'claude-home.tar.gz'))
      : null,
    at: new Date(now),
  };
  for (const [name, text] of [
    ['README.md', readmeText(facts)],
    ['ПЕРЕЕЗД.md', planText(facts)],
  ]) {
    const path = join(dir, name);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) writeAtomic(path, text);
  }
  return { at: new Date(now).toISOString(), memory, hooks: hooks?.files ?? 0 };
}
