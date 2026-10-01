import { join } from 'node:path';

export const MIN_MESSAGES = 8;
export const REPEAT_EVERY = 15;

export function isDue(state, { editing = false, prompting = false, remember = false } = {}) {
  if (state.asked) return false;
  if (remember) return true;
  const count = state.user_count + (prompting ? 1 : 0);
  const significant = editing || state.edited || count >= MIN_MESSAGES;
  if (!significant) return false;
  return state.noted_at === null || count - state.noted_at >= REPEAT_EVERY;
}

export function localDate(now) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function notePath(state, memoryDir, sessionId, now = new Date()) {
  return (
    state.note_path ?? join(memoryDir, 'sessions', `${localDate(now)}_${sessionId.slice(0, 8)}.md`)
  );
}
