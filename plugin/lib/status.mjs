import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { field, parse } from './frontmatter.mjs';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function day(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : '';
}

export function recordFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((n) => n.endsWith('.md') && n !== 'MEMORY.md')
      .sort();
  } catch {
    return [];
  }
}

export function startStatus({ records, pinned, last, problems }) {
  if (!records && !last) {
    return 'Память: пока пусто — первая заметка появится после работы в этом проекте';
  }
  const parts = [`${records} ${plural(records, 'запись', 'записи', 'записей')}`];
  if (pinned) parts.push(`${pinned} ${plural(pinned, 'закреплена', 'закреплены', 'закреплено')}`);
  if (last) {
    const next = last.next ? ` → дальше: ${last.next}` : '';
    parts.push(`прошлая сессия ${day(last.date)} «${last.title}»${next}`);
  }
  const tail = problems.length ? ` · ⚠ ${problems.join('; ')}` : '';
  return `Память: ${parts.join(' · ')}${tail}`;
}

export function doneStatus(dir, notePath, before) {
  if (!notePath || !existsSync(notePath)) {
    return 'Память: итог сессии не записан — можно попросить /echo-memory:remember';
  }
  const known = new Set(before ?? []);
  const kinds = recordFiles(dir)
    .filter((n) => !known.has(n))
    .map((n) => {
      try {
        return String(field(parse(readFileSync(join(dir, n), 'utf8')).fields, 'kind') ?? '');
      } catch {
        return '';
      }
    });
  if (!kinds.length) return 'Память: итог сессии записан';
  const named = kinds.filter(Boolean);
  const list = named.length ? ` (${named.join(', ')})` : '';
  return `Память: итог сессии записан · +${kinds.length} ${plural(kinds.length, 'запись', 'записи', 'записей')}${list}`;
}
