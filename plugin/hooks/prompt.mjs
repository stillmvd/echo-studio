import { ask } from '../lib/ask.mjs';
import { isDue } from '../lib/decide.mjs';
import { handoff } from '../lib/handoff.mjs';
import { loadState, memoryDir, saveState } from '../lib/paths.mjs';
import { run } from '../lib/run.mjs';

const REMEMBER = /^\/(echo-memory:)?remember\b/;

run('prompt', (input) => {
  const state = loadState(input.session_id);
  const remember = REMEMBER.test(String(input.prompt ?? '').trim());
  let additionalContext = handoff(state, input, 'prompt');
  if (!additionalContext && isDue(state, { prompting: true, remember })) {
    state.memory_dir ??= memoryDir(input.cwd);
    additionalContext = ask(state, input.session_id);
  }
  if (!additionalContext) return null;
  saveState(input.session_id, state);
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } };
});
