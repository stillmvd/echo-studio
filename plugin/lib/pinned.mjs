import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { field, parse } from './frontmatter.mjs';

export const PINNED_LIMIT = 6500;

export function pinnedOverflow(dir) {
  const pinned = readPinned(dir);
  const chars = pinned.reduce((sum, p) => sum + p.chars, 0);
  if (chars <= PINNED_LIMIT) return null;
  return `Закреплённые записи (importance: 3) не влезают в старт сессии: ${chars} из ${PINNED_LIMIT} символов, лишние Claude не получит целиком. Сейчас открепи (importance: 2) записи, которые не нужны в каждой сессии: технические грабли подтянутся по файлу, правила из CLAUDE.md и так загружены. Закреплёнными оставь только правила поведения. Закреплены: ${pinned.map((p) => `${p.file} (${p.chars})`).join(', ')}.`;
}

export function readPinned(dir) {
  let names;
  try {
    names = readdirSync(dir)
      .filter((n) => n.endsWith('.md') && n !== 'MEMORY.md')
      .sort();
  } catch {
    return [];
  }
  const pinned = [];
  for (const name of names) {
    try {
      const { fields, body, error } = parse(readFileSync(join(dir, name), 'utf8'));
      if (error || Number(field(fields, 'importance')) !== 3) continue;
      const title = String(field(fields, 'description') || field(fields, 'name') || name);
      const text = body.trim();
      pinned.push({
        file: name,
        text: `### ${title} — memory/${name}\n${text}`,
        chars: [...text].length,
      });
    } catch {}
  }
  return pinned;
}

export function fitPinned(pinned, room) {
  const header = 'Закреплённые записи (полный текст):';
  const kept = [];
  let size = header.length + 1;
  for (const p of pinned) {
    if (size + p.text.length + 2 > room) continue;
    kept.push(p);
    size += p.text.length + 2;
  }
  const dropped = pinned.filter((p) => !kept.includes(p)).map((p) => p.file);
  const block = kept.length ? [header, ...kept.map((p) => p.text)].join('\n\n') : '';
  return { block, dropped };
}
