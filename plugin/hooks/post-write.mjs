import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { memoryDir } from '../lib/paths.mjs';
import { run, writeAtomic } from '../lib/run.mjs';
import { scrub } from '../lib/scrub.mjs';

run('post-write', (input) => {
  const file = input.tool_input?.file_path;
  if (!file?.toLowerCase().endsWith('.md')) return null;
  const rel = relative(memoryDir(input.cwd), resolve(input.cwd, file));
  if (rel.startsWith('..') || resolve(rel) === rel) return null;
  const text = readFileSync(file, 'utf8');
  const clean = scrub(text);
  if (clean !== text) writeAtomic(file, clean);
  return null;
});
