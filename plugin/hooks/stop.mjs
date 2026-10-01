import { existsSync, statSync } from 'node:fs';
import { loadState, memoryDir, saveState } from '../lib/paths.mjs';
import { run } from '../lib/run.mjs';
import { doneStatus } from '../lib/status.mjs';
import { readSince, tally } from '../lib/transcript.mjs';

run('stop', (input) => {
  const state = loadState(input.session_id);
  const { entries, offset } = readSince(input.transcript_path, state.offset);
  const { state: next } = tally(entries, { ...state, offset });
  next.memory_dir ??= memoryDir(input.cwd);
  let output = null;
  if (next.asked) {
    const note = next.note_path;
    if (note && existsSync(note) && statSync(note).mtimeMs >= next.asked - 2000) {
      output = { systemMessage: doneStatus(next.memory_dir, note, next.records_before) };
      next.noted_at = next.user_count;
    }
    next.asked = null;
  }
  saveState(input.session_id, next);
  return output;
});
