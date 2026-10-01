import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { workDir, writeAtomic } from './run.mjs';

function worktreeRoot(gitFile, dir) {
  const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(gitFile, 'utf8'));
  if (!match) return dir;
  const gitdir = resolve(dir, match[1].trim());
  const commondirFile = join(gitdir, 'commondir');
  if (!existsSync(commondirFile)) return dir;
  const common = readFileSync(commondirFile, 'utf8').trim();
  return dirname(isAbsolute(common) ? common : resolve(gitdir, common));
}

function hasCommit(gitDir) {
  const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
  const ref = /^ref:\s*(.+)$/.exec(head)?.[1];
  if (!ref) return /^[0-9a-f]{40}/.test(head);
  if (existsSync(join(gitDir, ref))) return true;
  const packed = join(gitDir, 'packed-refs');
  return existsSync(packed) && readFileSync(packed, 'utf8').includes(` ${ref}`);
}

export function projectRoot(cwd) {
  let dir = resolve(cwd);
  for (;;) {
    const git = join(dir, '.git');
    if (existsSync(git)) {
      if (statSync(git).isFile()) return worktreeRoot(git, dir);
      return hasCommit(git) ? dir : resolve(cwd);
    }
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
}

export function slug(root) {
  return root.replace(/[^A-Za-z0-9]/g, '-');
}

export function memoryDir(cwd, home = homedir()) {
  return join(home, '.claude', 'projects', slug(projectRoot(cwd)), 'memory');
}

export function statePath(sessionId) {
  return join(workDir, `${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '')}.json`);
}

const defaults = {
  offset: 0,
  user_count: 0,
  edited: false,
  noted_at: null,
  note_path: null,
  asked: null,
  memory_dir: null,
  file_map: {},
  injected: [],
  first_prompt: null,
  touched: [],
  recent: [],
};

export function loadState(sessionId) {
  try {
    return { ...defaults, ...JSON.parse(readFileSync(statePath(sessionId), 'utf8')) };
  } catch {
    return { ...defaults };
  }
}

export function saveState(sessionId, state) {
  writeAtomic(statePath(sessionId), JSON.stringify(state));
}
