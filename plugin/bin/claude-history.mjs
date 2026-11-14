import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { extract, matches, render, snippets, titleOf } from '../lib/history.mjs';
import { writeAtomic } from '../lib/run.mjs';

const WANTED = /"type":"(user|assistant|custom-title|ai-title)"/;

export function claudeProjects(env = process.env, home = homedir()) {
  return join(env.CLAUDE_CONFIG_DIR ?? join(home, '.claude'), 'projects');
}

export function cacheDir(env = process.env, home = homedir()) {
  const base = env.LOCALAPPDATA ?? join(home, '.cache');
  return join(base, 'echo-memory', 'claude-history');
}

export function sessionFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const dir of readdirSync(root)) {
    const path = join(root, dir);
    let names;
    try {
      names = readdirSync(path);
    } catch {
      continue;
    }
    for (const name of names)
      if (name.endsWith('.jsonl')) out.push({ project: dir, file: join(path, name) });
  }
  return out;
}

async function parse(file) {
  const entries = [];
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!WANTED.test(line.slice(0, 400)) && !WANTED.test(line)) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {}
  }
  return extract(entries, file);
}

export async function loadAll({ root = claudeProjects(), cache = cacheDir(), onProgress } = {}) {
  mkdirSync(cache, { recursive: true });
  const files = sessionFiles(root);
  const keep = new Set();
  const sessions = [];
  let fresh = 0;
  for (const { project, file } of files) {
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    const key = `${project}__${basename(file, '.jsonl')}.json`;
    keep.add(key);
    const cached = join(cache, key);
    let session = null;
    try {
      const hit = JSON.parse(readFileSync(cached, 'utf8'));
      if (hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) session = hit.session;
    } catch {}
    if (!session) {
      session = await parse(file);
      session.project = project;
      session.file = file;
      writeAtomic(cached, JSON.stringify({ size: stat.size, mtimeMs: stat.mtimeMs, session }));
      fresh += 1;
      onProgress?.(fresh);
    }
    sessions.push(session);
  }
  for (const name of readdirSync(cache))
    if (name.endsWith('.json') && !keep.has(name)) rmSync(join(cache, name), { force: true });
  sessions.sort((a, b) => String(b.end ?? '').localeCompare(String(a.end ?? '')));
  return { sessions, fresh };
}

function option(args, name, fallback) {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  const value = args[at + 1];
  args.splice(at, 2);
  return value ?? fallback;
}

function byProject(sessions, project) {
  if (!project) return sessions;
  const needle = project.toLowerCase();
  return sessions.filter((s) => `${s.cwd ?? ''} ${s.project}`.toLowerCase().includes(needle));
}

const line = (s) =>
  `${(s.end ?? '').slice(0, 10)}  ${s.id}  ${s.cwd ?? s.project}\n    ${titleOf(s).replace(/\s+/g, ' ').slice(0, 140)}`;

const HELP = `Переписки Claude Code (только чтение) — ~/.claude/projects/*/*.jsonl

  list   [--project <часть пути>] [--days N] [--limit N]   последние сессии
  search <слова…> [--project <часть пути>] [--limit N]      сессии, где есть все слова
  read   <id или начало id> [--from N] [--max символов]     сессия целиком в markdown, по частям
  index                                                     обновить кэш (первый раз — несколько минут)

Кэш: ${cacheDir()}`;

export async function main(argv, print = console.log) {
  const args = [...argv];
  const cmd = args.shift();
  if (!cmd || cmd === '--help' || cmd === 'help') return print(HELP);
  const project = option(args, '--project');
  const limit = Number(option(args, '--limit', cmd === 'search' ? 10 : 30));
  const days = Number(option(args, '--days', 0));
  const from = Number(option(args, '--from', 0));
  const max = Number(option(args, '--max', 60000));
  const { sessions, fresh } = await loadAll({
    onProgress: (n) => n % 25 === 0 && process.stderr.write(`обработано ${n}…\n`),
  });
  if (cmd === 'index') return print(`сессий: ${sessions.length}, обновлено: ${fresh}`);
  if (cmd === 'list') {
    const since = days ? new Date(Date.now() - days * 864e5).toISOString() : '';
    const list = byProject(sessions, project).filter((s) => (s.end ?? '') >= since);
    return print(list.slice(0, limit).map(line).join('\n') || 'Сессий нет');
  }
  if (cmd === 'search') {
    const words = args.map((w) => w.toLowerCase()).filter(Boolean);
    if (!words.length) return print('Нужны слова для поиска');
    const found = byProject(sessions, project).filter((s) => matches(s, words));
    const out = found.slice(0, limit).map((s) => {
      const hits = snippets(s, words)
        .map((h) => `    #${h.turn} ${h.role}: …${h.text}…`)
        .join('\n');
      return `${line(s)}${hits ? `\n${hits}` : ''}`;
    });
    return print(
      out.length
        ? `${out.join('\n\n')}\n\nнайдено ${found.length}, показано ${out.length}`
        : 'Ничего не найдено',
    );
  }
  if (cmd === 'read') {
    const id = (args[0] ?? '').toLowerCase();
    const hits = id ? sessions.filter((s) => s.id.toLowerCase().startsWith(id)) : [];
    if (hits.length !== 1)
      return print(
        hits.length
          ? `Под «${id}» подходит ${hits.length} сессий — уточни id`
          : 'Сессия не найдена',
      );
    return print(render(hits[0], { from, max }));
  }
  print(HELP);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
