import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDate, notePath, shouldBlock } from '../lib/decide.mjs';
import { loadState, memoryDir, saveState } from '../lib/paths.mjs';
import { run } from '../lib/run.mjs';
import { readSince, tally } from '../lib/transcript.mjs';

const prompts = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m);
}

run('stop', (input) => {
  const state = loadState(input.session_id);
  const { entries, offset } = readSince(input.transcript_path, state.offset);
  const { state: next, remember } = tally(entries, { ...state, offset });
  next.memory_dir ??= memoryDir(input.cwd);
  let output = null;
  if (shouldBlock(next, { stopHookActive: input.stop_hook_active === true, remember })) {
    const now = new Date();
    next.note_path = notePath(next, next.memory_dir, input.session_id, now);
    next.noted_at = next.user_count;
    const template = readFileSync(join(prompts, 'summary.md'), 'utf8');
    output = {
      decision: 'block',
      reason: fill(template, {
        note_path: next.note_path,
        memory_dir: next.memory_dir,
        session_id: input.session_id,
        session8: input.session_id.slice(0, 8),
        date: localDate(now),
        now: now.toISOString(),
      }),
    };
  }
  saveState(input.session_id, next);
  return output;
});
