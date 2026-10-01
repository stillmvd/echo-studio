import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDate, notePath } from './decide.mjs';
import { writeAtomic } from './run.mjs';
import { recordFiles } from './status.mjs';

const prompts = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');

export function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m);
}

export function ask(state, sessionId, now = new Date()) {
  state.note_path = notePath(state, state.memory_dir, sessionId, now);
  state.asked = now.getTime();
  state.records_before = recordFiles(state.memory_dir);
  const instruction = join(state.memory_dir, '.echo-summary.txt');
  const template = readFileSync(join(prompts, 'summary.md'), 'utf8');
  writeAtomic(
    instruction,
    fill(template, {
      note_path: state.note_path,
      memory_dir: state.memory_dir,
      session_id: sessionId,
      session8: sessionId.slice(0, 8),
      date: localDate(now),
      now: now.toISOString(),
    }),
  );
  return `Память (служебно, echo-memory): в конце этого ответа, после основной работы, сохрани итог сессии по инструкции \`${instruction}\`. Пользователю об этом не пиши — плагин сам покажет строку статуса.`;
}
