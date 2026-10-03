import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { ask } from '../lib/ask.mjs';
import { isDue } from '../lib/decide.mjs';
import { handoff } from '../lib/handoff.mjs';
import { loadState, memoryDir, saveState } from '../lib/paths.mjs';
import { run, writeAtomic } from '../lib/run.mjs';
import { scrub } from '../lib/scrub.mjs';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function inMemory(cwd, file) {
  const rel = relative(memoryDir(cwd), resolve(cwd, file));
  return !rel.startsWith('..') && resolve(rel) !== rel;
}

run('post-tool', (input) => {
  const file = WRITE_TOOLS.has(input.tool_name)
    ? (input.tool_input?.file_path ?? input.tool_input?.notebook_path)
    : null;
  if (file && inMemory(input.cwd, file)) {
    if (!file.toLowerCase().endsWith('.md')) return null;
    const text = readFileSync(file, 'utf8');
    const clean = scrub(text);
    if (clean !== text) writeAtomic(file, clean);
    return null;
  }
  const state = loadState(input.session_id);
  let additionalContext = handoff(state, input, 'tool');
  if (file) {
    state.edited = true;
    state.memory_dir ??= memoryDir(input.cwd);
    if (!additionalContext && isDue(state, { editing: true })) {
      additionalContext = ask(state, input.session_id);
    }
  }
  if (file || additionalContext) saveState(input.session_id, state);
  if (!additionalContext) return null;
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } };
});
