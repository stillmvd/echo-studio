import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { field, parse } from './frontmatter.mjs';

export const OPEN = '<!-- memory:sessions -->';
export const CLOSE = '<!-- /memory:sessions -->';
export const INDEX_LIMIT = 200;

function nextStep(body) {
  const section = /^## Дальше[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)?.[1] ?? '';
  const line = section
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .find((l) => l && l !== '—' && l !== '-');
  return line ? line.slice(0, 160) : null;
}

export function readSessions(dir, limit) {
  const sessionsDir = join(dir, 'sessions');
  let names;
  try {
    names = readdirSync(sessionsDir).filter((n) => n.endsWith('.md'));
  } catch {
    return [];
  }
  const byTime = names
    .map((name) => ({ name, mtime: statSync(join(sessionsDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
  const notes = [];
  for (const { name, mtime } of byTime) {
    try {
      const { fields, body, error } = parse(readFileSync(join(sessionsDir, name), 'utf8'));
      if (error) continue;
      const updated = String(field(fields, 'updated') ?? new Date(mtime).toISOString());
      notes.push({
        file: `sessions/${name}`,
        date: /^\d{4}-\d{2}-\d{2}/.exec(name)?.[0] ?? updated.slice(0, 10),
        updated,
        title: String(field(fields, 'description') || field(fields, 'title') || name),
        capture: field(fields, 'capture') ?? 'claude',
        next: nextStep(body),
      });
    } catch {}
  }
  return notes.sort((a, b) => b.updated.localeCompare(a.updated));
}

export function sessionLine(note) {
  const next = note.next ? ` — дальше: ${note.next}` : '';
  return `- [${note.date} — ${note.title}](${note.file})${next}`;
}

export function upsertBlock(md, lines) {
  const eol = md.includes('\r\n') ? '\r\n' : '\n';
  const block = [OPEN, ...lines, CLOSE].join(eol);
  const start = md.indexOf(OPEN);
  const end = md.indexOf(CLOSE, start);
  if (start >= 0 && end >= 0) return md.slice(0, start) + block + md.slice(end + CLOSE.length);
  const base = md && !md.endsWith(eol) ? md + eol : md;
  return `${base}${base ? eol : ''}${block}${eol}`;
}

export function fitLines(lines, limit) {
  const out = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length + 1 > limit) break;
    out.push(line);
    size += line.length + 1;
  }
  return out;
}
