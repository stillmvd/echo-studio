import { readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { field, parse } from './frontmatter.mjs';

export const MIN_FILE_BYTES = 1500;

export function normalize(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

export function buildFileMap(memoryDir) {
  const map = {};
  let names;
  try {
    names = readdirSync(memoryDir).filter((n) => n.endsWith('.md') && n !== 'MEMORY.md');
  } catch {
    return map;
  }
  for (const name of names) {
    try {
      const path = join(memoryDir, name);
      const { fields, error } = parse(readFileSync(path, 'utf8'));
      const files = field(fields, 'files');
      if (error || !Array.isArray(files)) continue;
      const entry = {
        record: name,
        description: String(field(fields, 'description') ?? name),
        mtime: statSync(path).mtimeMs,
      };
      for (const file of files) {
        if (typeof file !== 'string' || !file.trim()) continue;
        const key = normalize(file.trim());
        map[key] = [...(map[key] ?? []), entry];
      }
    } catch {}
  }
  return map;
}

export function recordsFor(map, root, filePath) {
  const rel = isAbsolute(filePath) ? relative(root, filePath) : filePath;
  if (rel.startsWith('..') || isAbsolute(rel)) return { key: null, entries: [] };
  const key = normalize(rel);
  return { key, entries: map[key] ?? [] };
}
