import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, fill } from './ask.mjs';
import { localDate } from './decide.mjs';
import { memoryDir, projectRoot, safeId } from './paths.mjs';
import { workDir, writeAtomic } from './run.mjs';

export const HANDOFF_MARGIN = 40000;

const prompts = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

const STEPS = {
  tool: 'Доведи текущий шаг до целостного состояния: допиши начатую правку или мысль, оставь код рабочим.',
  prompt: 'Новое сообщение пользователя выполни после шагов 2 и 3.',
};

export function usagePath(sessionId) {
  return join(workDir, `ctx-${safeId(sessionId)}.json`);
}

export function readUsage(sessionId) {
  let data;
  try {
    data = JSON.parse(readFileSync(usagePath(sessionId), 'utf8'));
  } catch {
    return null;
  }
  if (Number.isFinite(data.tokens) && Number.isFinite(data.window) && data.window > 0) {
    const pct = Math.round((data.tokens / data.window) * 100);
    return { tokens: data.tokens, window: data.window, pct };
  }
  if (Number.isFinite(data.used_pct) && Number.isFinite(data.size) && data.size > 0) {
    return {
      tokens: Math.round((data.used_pct / 100) * data.size),
      window: data.size,
      pct: data.used_pct,
    };
  }
  return null;
}

export function threshold(window) {
  return window - HANDOFF_MARGIN;
}

export function kilo(tokens) {
  return `${Math.round(tokens / 1000)}k`;
}

export function handoffFile(root) {
  const candidates = [join(root, 'HANDOFF.md'), join(root, '.planning', 'HANDOFF.md')];
  return candidates.find((file) => existsSync(file)) ?? candidates[0];
}

export function handoff(state, input, when, now = new Date()) {
  if (input.agent_id) return null;
  const usage = readUsage(input.session_id);
  if (usage === null) return null;
  if (usage.tokens < usage.window / 2) {
    state.handoff_armed = true;
    return null;
  }
  if (state.handoff_armed === false || usage.tokens < threshold(usage.window)) return null;
  state.handoff_armed = false;
  state.memory_dir ??= memoryDir(input.cwd);
  if (!state.asked) ask(state, input.session_id, now);
  const root = projectRoot(input.cwd);
  const instruction = join(state.memory_dir, '.echo-handoff.txt');
  const template = readFileSync(join(prompts, 'handoff.md'), 'utf8');
  const tokens = kilo(usage.tokens);
  const window = kilo(usage.window);
  writeAtomic(
    instruction,
    fill(template, {
      tokens,
      window,
      step: STEPS[when],
      handoff: handoffFile(root),
      summary: join(state.memory_dir, '.echo-summary.txt'),
      date: localDate(now),
    }),
  );
  return `Служебно, echo-memory: контекст — ${tokens} из ${window} токенов, скоро автосжатие. Обнови HANDOFF.md и память по инструкции \`${instruction}\` и продолжай работу в этой сессии. Пользователю об инструкции не пиши.`;
}
