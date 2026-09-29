import { existsSync } from 'node:fs';
import { MIN_MESSAGES, notePath } from '../lib/decide.mjs';
import { buildDraft } from '../lib/draft.mjs';
import { loadState, memoryDir, saveState } from '../lib/paths.mjs';
import { run, writeAtomic } from '../lib/run.mjs';
import { scrub } from '../lib/scrub.mjs';
import { readSince, tally } from '../lib/transcript.mjs';

run('session-end', (input) => {
  const state = loadState(input.session_id);
  const { entries, offset } = readSince(input.transcript_path, state.offset);
  const { state: next } = tally(entries, { ...state, offset });
  next.memory_dir ??= memoryDir(input.cwd);
  saveState(input.session_id, next);
  if (!next.edited && next.user_count < MIN_MESSAGES) return null;
  const path = notePath(next, next.memory_dir, input.session_id);
  if (existsSync(path)) return null;
  writeAtomic(path, scrub(buildDraft(next, input.session_id)));
  return null;
});
