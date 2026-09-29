import { closeSync, openSync, readSync, statSync } from 'node:fs';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const REMEMBER = /<command-name>\/(?:echo-memory:)?remember<\/command-name>/;
const RECENT = 3;
const SNIPPET = 500;

export function readSince(path, offset) {
  const size = statSync(path).size;
  const start = size < offset ? 0 : offset;
  if (size === start) return { entries: [], offset: start };
  const buffer = Buffer.alloc(size - start);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  const end = buffer.lastIndexOf(0x0a);
  if (end < 0) return { entries: [], offset: start };
  const entries = [];
  for (const line of buffer.subarray(0, end).toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {}
  }
  return { entries, offset: start + end + 1 };
}

function userText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const texts = content.filter((p) => p?.type === 'text').map((p) => p.text);
  return texts.length ? texts.join('\n') : null;
}

function pushRecent(recent, role, text) {
  const trimmed = text.trim();
  if (!trimmed) return recent;
  return [...recent, { role, text: trimmed.slice(0, SNIPPET) }].slice(-RECENT);
}

export function tally(entries, state) {
  const next = { ...state, touched: [...state.touched], recent: [...state.recent] };
  let remember = false;
  for (const e of entries) {
    if (e?.isSidechain) continue;
    if (e?.type === 'user' && !e.isMeta) {
      const text = userText(e.message?.content);
      if (text === null || text.startsWith('<local-command')) continue;
      next.user_count += 1;
      if (REMEMBER.test(text)) remember = true;
      if (!text.startsWith('<')) {
        next.first_prompt ??= text.slice(0, 2000);
        next.recent = pushRecent(next.recent, 'user', text);
      }
    } else if (e?.type === 'assistant' && Array.isArray(e.message?.content)) {
      for (const part of e.message.content) {
        if (part?.type === 'tool_use' && EDIT_TOOLS.has(part.name)) {
          next.edited = true;
          const file = part.input?.file_path ?? part.input?.notebook_path;
          if (file && !next.touched.includes(file)) next.touched.push(file);
        } else if (part?.type === 'text' && typeof part.text === 'string') {
          next.recent = pushRecent(next.recent, 'assistant', part.text);
        }
      }
    }
  }
  return { state: next, remember };
}
