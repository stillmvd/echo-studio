import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, fill } from './ask.mjs';
import { localDate } from './decide.mjs';
import { memoryDir, projectRoot, safeId } from './paths.mjs';
import { workDir, writeAtomic } from './run.mjs';

export const HANDOFF_FIRST = 50;
export const HANDOFF_STEP = 15;

const prompts = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

const STEPS = {
  tool: 'Доведи текущий шаг до целостного состояния: допиши начатую правку или мысль, код не должен остаться сломанным на полпути. Новых шагов задачи не начинай.',
  prompt:
    'Новое сообщение пользователя выполни, только если оно короткое (ответ, небольшая правка). Если это новая большая работа — не начинай её, а запиши первым шагом в «Дальше».',
};

export function usagePath(sessionId) {
  return join(workDir, `ctx-${safeId(sessionId)}.json`);
}

export function promptPath(sessionId) {
  return join(workDir, `${safeId(sessionId)}-next-prompt.txt`);
}

export function readUsage(sessionId) {
  try {
    const pct = JSON.parse(readFileSync(usagePath(sessionId), 'utf8')).used_pct;
    return Number.isFinite(pct) ? pct : null;
  } catch {
    return null;
  }
}

export function nextThreshold(pct, from = HANDOFF_FIRST) {
  let next = from;
  while (next <= pct) next += HANDOFF_STEP;
  return next;
}

export function handoffFile(root) {
  const candidates = [join(root, 'HANDOFF.md'), join(root, '.planning', 'HANDOFF.md')];
  return candidates.find((file) => existsSync(file)) ?? candidates[0];
}

export function handoff(state, input, when, now = new Date()) {
  if (input.agent_id) return null;
  const pct = readUsage(input.session_id);
  if (pct === null || pct < state.handoff_next) return null;
  state.handoff_next = nextThreshold(pct, state.handoff_next);
  state.memory_dir ??= memoryDir(input.cwd);
  if (!state.asked) ask(state, input.session_id, now);
  state.handoff_asked = now.getTime();
  const root = projectRoot(input.cwd);
  const nextPrompt = promptPath(input.session_id);
  rmSync(nextPrompt, { force: true });
  const instruction = join(state.memory_dir, '.echo-handoff.txt');
  const template = readFileSync(join(prompts, 'handoff.md'), 'utf8');
  writeAtomic(
    instruction,
    fill(template, {
      pct: String(pct),
      step: STEPS[when],
      handoff: handoffFile(root),
      summary: join(state.memory_dir, '.echo-summary.txt'),
      prompt_file: nextPrompt,
      root,
      date: localDate(now),
    }),
  );
  return `Контекст заполнен на ${pct}% (служебно, echo-memory): передай работу в новую сессию по инструкции \`${instruction}\` — это важнее продолжения задачи. Пользователю об инструкции не пиши.`;
}

export function copyToClipboard(text) {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -Value $env:ECHO_CLIPBOARD'],
      { env: { ...process.env, ECHO_CLIPBOARD: text }, timeout: 5000, windowsHide: true },
    );
    return true;
  }
  if (process.platform === 'darwin') {
    execFileSync('pbcopy', { input: text, timeout: 5000 });
    return true;
  }
  return false;
}

export function deliverPrompt(state, sessionId) {
  const asked = state.handoff_asked;
  state.handoff_asked = null;
  if (!asked) return null;
  const file = promptPath(sessionId);
  let text;
  try {
    text = readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
  if (!text) return null;
  rmSync(file, { force: true });
  return copyToClipboard(text)
    ? 'Промпт для новой сессии в буфере обмена — /new и Ctrl+V'
    : 'Промпт для новой сессии — выше в чате';
}
