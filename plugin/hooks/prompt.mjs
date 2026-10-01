import { ask } from '../lib/ask.mjs';
import { isDue } from '../lib/decide.mjs';
import { loadState, memoryDir, saveState } from '../lib/paths.mjs';
import { run } from '../lib/run.mjs';

const REMEMBER = /^\/(echo-memory:)?remember\b/;

run('prompt', (input) => {
  const state = loadState(input.session_id);
  const remember = REMEMBER.test(String(input.prompt ?? '').trim());
  if (!isDue(state, { prompting: true, remember })) return null;
  state.memory_dir ??= memoryDir(input.cwd);
  const additionalContext = ask(state, input.session_id);
  saveState(input.session_id, state);
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } };
});
