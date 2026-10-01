import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { ask } from '../lib/ask.mjs';
import { isDue } from '../lib/decide.mjs';
import { loadState, memoryDir, saveState } from '../lib/paths.mjs';
import { run, writeAtomic } from '../lib/run.mjs';
import { scrub } from '../lib/scrub.mjs';

function inMemory(cwd, file) {
  const rel = relative(memoryDir(cwd), resolve(cwd, file));
  return !rel.startsWith('..') && resolve(rel) !== rel;
}

run('post-write', (input) => {
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!file) return null;
  if (inMemory(input.cwd, file)) {
    if (!file.toLowerCase().endsWith('.md')) return null;
    const text = readFileSync(file, 'utf8');
    const clean = scrub(text);
    if (clean !== text) writeAtomic(file, clean);
    return null;
  }
  const state = loadState(input.session_id);
  state.edited = true;
  state.memory_dir ??= memoryDir(input.cwd);
  let output = null;
  if (isDue(state, { editing: true })) {
    output = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: ask(state, input.session_id),
      },
    };
  }
  saveState(input.session_id, state);
  return output;
});
