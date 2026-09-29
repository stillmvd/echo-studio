import { join } from 'node:path';

export const MIN_MESSAGES = 8;
export const REPEAT_EVERY = 15;

export function shouldBlock(state, { stopHookActive, remember }) {
  if (stopHookActive) return false;
  if (remember) return true;
  const significant = state.edited || state.user_count >= MIN_MESSAGES;
  if (!significant) return false;
  return state.noted_at === null || state.user_count - state.noted_at >= REPEAT_EVERY;
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
