import { basename } from 'node:path';

const TOOL_NOTE = 200;
const NOISE = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

function textParts(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((p) => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n');
}

function toolNote(part) {
  const input = part.input ?? {};
  const main =
    input.command ??
    input.file_path ??
    input.path ??
    input.pattern ??
    input.url ??
    input.description ??
    input.prompt ??
    input.query ??
    '';
  const text = String(main).replace(/\s+/g, ' ').trim().slice(0, TOOL_NOTE);
  return `[${part.name}${text ? `: ${text}` : ''}]`;
}

function clean(text) {
  return text.replace(NOISE, '').trim();
}

function command(text) {
  const name = /<command-name>([^<]+)<\/command-name>/.exec(text)?.[1];
  if (!name) return null;
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim();
  return args ? `${name} ${args}` : name;
}

export function extract(entries, file = '') {
  const session = {
    id: basename(file, '.jsonl'),
    title: null,
    aiTitle: null,
    cwd: null,
    branch: null,
    start: null,
    end: null,
    firstPrompt: null,
    turns: [],
  };
  const push = (role, text, at) => {
    if (!text) return;
    const last = session.turns.at(-1);
    if (last && last.role === role && role === 'assistant') last.text += `\n${text}`;
    else session.turns.push({ role, text, at });
  };
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'custom-title' && e.customTitle) session.title = e.customTitle;
    if (e.type === 'ai-title' && e.aiTitle) session.aiTitle = e.aiTitle;
    if (e.isSidechain) continue;
    if (e.type !== 'user' && e.type !== 'assistant') continue;
    const at = e.timestamp ?? null;
    if (at) {
      session.start ??= at;
      session.end = at;
    }
    session.cwd ??= e.cwd ?? null;
    session.branch ??= e.gitBranch ?? null;
    const content = e.message?.content;
    if (e.type === 'user') {
      if (e.isMeta) continue;
      const raw = textParts(content);
      if (!raw || raw.startsWith('<local-command')) continue;
      const cmd = command(raw);
      const text = cmd ?? clean(raw);
      if (!text) continue;
      if (e.isCompactSummary) {
        push('summary', text, at);
        continue;
      }
      if (!cmd && !text.startsWith('<')) session.firstPrompt ??= text.slice(0, 300);
      push('user', text, at);
    } else if (Array.isArray(content)) {
      const parts = [];
      for (const part of content) {
        if (part?.type === 'text' && part.text?.trim()) parts.push(part.text.trim());
        else if (part?.type === 'tool_use') parts.push(toolNote(part));
      }
      push('assistant', parts.join('\n'), at);
    }
  }
  return session;
}

export function titleOf(session) {
  return session.title ?? session.aiTitle ?? session.firstPrompt ?? '(без названия)';
}

const ROLE = { user: 'Пользователь', assistant: 'Claude', summary: 'Сводка после сжатия' };

export function render(session, { from = 0, max = 60000 } = {}) {
  const head = [
    `# ${titleOf(session).replace(/\s+/g, ' ').slice(0, 120)}`,
    '',
    `- сессия: \`${session.id}\``,
    session.cwd ? `- папка: \`${session.cwd}\`` : null,
    session.branch ? `- ветка: \`${session.branch}\`` : null,
    session.start ? `- время: ${session.start} — ${session.end}` : null,
    `- реплик: ${session.turns.length}`,
    '',
  ].filter((l) => l !== null);
  let out = `${head.join('\n')}\n`;
  let i = from;
  for (; i < session.turns.length; i++) {
    const t = session.turns[i];
    const block = `## ${i + 1}. ${ROLE[t.role]}${t.at ? ` · ${t.at.slice(0, 16).replace('T', ' ')}` : ''}\n\n${t.text}\n\n`;
    if (out.length + block.length > max && i > from) break;
    out += block;
  }
  if (i < session.turns.length)
    out += `…дальше: \`read ${session.id} --from ${i}\` (осталось ${session.turns.length - i})\n`;
  return out;
}

export function snippets(session, words, limit = 3) {
  const hits = [];
  for (let i = 0; i < session.turns.length && hits.length < limit; i++) {
    const text = session.turns[i].text;
    const lower = text.toLowerCase();
    if (!words.every((w) => lower.includes(w))) continue;
    const at = lower.indexOf(words[0]);
    const start = Math.max(0, at - 80);
    hits.push({
      turn: i,
      role: session.turns[i].role,
      text: text
        .slice(start, at + 160)
        .replace(/\s+/g, ' ')
        .trim(),
    });
  }
  return hits;
}

export function matches(session, words) {
  const all =
    `${titleOf(session)}\n${session.cwd ?? ''}\n${session.turns.map((t) => t.text).join('\n')}`.toLowerCase();
  return words.every((w) => all.includes(w));
}
