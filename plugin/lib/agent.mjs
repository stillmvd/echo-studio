import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { workDir, writeAtomic } from './run.mjs';

export const KIMI = 'kimi_code_cli';

export function isKimi(input) {
  return input?.client_type === KIMI;
}

export function kimiHome(env = process.env, home = homedir()) {
  return env.KIMI_CODE_HOME || join(home, '.kimi-code');
}

export function kimiWire(sessionId, root = kimiHome()) {
  const sessions = join(root, 'sessions');
  if (!sessionId || !existsSync(sessions)) return null;
  for (const space of readdirSync(sessions)) {
    const wire = join(sessions, space, sessionId, 'agents', 'main', 'wire.jsonl');
    if (existsSync(wire)) return wire;
  }
  return null;
}

function promptText(prompt) {
  if (!Array.isArray(prompt)) return prompt ?? '';
  return prompt
    .filter((p) => p?.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

function withFilePath(args, cwd) {
  if (!args || typeof args.path !== 'string' || args.file_path !== undefined) return args;
  return { ...args, file_path: resolve(cwd ?? '.', args.path) };
}

export function normalize(input, root) {
  if (!isKimi(input)) return input;
  return {
    ...input,
    prompt: promptText(input.prompt),
    tool_input: withFilePath(input.tool_input, input.cwd),
    transcript_path: input.transcript_path ?? kimiWire(input.session_id, root),
  };
}

const SERVICE = /^<(system-reminder|hook_result)\b/;

export function fromKimi(records, cwd) {
  const entries = [];
  for (const r of records) {
    if (r?.type === 'context.append_message' && r.message?.role === 'user') {
      const parts = (r.message.content ?? []).filter(
        (p) =>
          p?.type === 'text' && typeof p.text === 'string' && !SERVICE.test(p.text.trimStart()),
      );
      if (parts.length) entries.push({ type: 'user', message: { content: parts } });
    } else if (r?.type === 'context.append_loop_event') {
      const e = r.event;
      if (e?.type === 'content.part' && e.part?.type === 'text') {
        entries.push({
          type: 'assistant',
          message: { content: [{ type: 'text', text: e.part.text }] },
        });
      } else if (e?.type === 'tool.call') {
        const input = withFilePath(e.args ?? {}, cwd);
        entries.push({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', name: e.name, input }] },
        });
      }
    }
  }
  return entries;
}

function pendingPath(sessionId) {
  return join(workDir, `${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '')}.kimi.json`);
}

function readPending(sessionId) {
  try {
    return JSON.parse(readFileSync(pendingPath(sessionId), 'utf8'));
  } catch {
    return [];
  }
}

export function pushPending(sessionId, text) {
  writeAtomic(pendingPath(sessionId), JSON.stringify([...readPending(sessionId), text]));
}

export function takePending(sessionId) {
  const items = readPending(sessionId);
  if (items.length) rmSync(pendingPath(sessionId), { force: true });
  return items;
}

export function kimiBefore(input) {
  if (input.hook_event_name !== 'Stop' || input.stop_hook_active) return null;
  const items = takePending(input.session_id);
  return items.length ? items.join('\n\n') : null;
}

export function kimiAfter(input, output) {
  const context = output?.hookSpecificOutput?.additionalContext ?? null;
  if (input.hook_event_name === 'UserPromptSubmit') {
    const parts = [...takePending(input.session_id), context].filter(Boolean);
    return parts.length ? parts.join('\n\n') : null;
  }
  if (input.hook_event_name === 'SessionEnd') takePending(input.session_id);
  else if (context && input.hook_event_name !== 'Stop') pushPending(input.session_id, context);
  return null;
}
