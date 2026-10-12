import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fitPinned, PINNED_LIMIT, pinnedOverflow, readPinned } from './pinned.mjs';

const rec = (dir, name, importance, body) =>
  writeFileSync(
    join(dir, `${name}.md`),
    `---\nname: ${name}\ndescription: Запись ${name}\nmetadata:\n  importance: ${importance}\n---\n${body}\n`,
  );

describe('pinned records', () => {
  it('reads only importance 3 with full text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pin-'));
    rec(dir, 'a', 3, 'Всегда RangeError.');
    rec(dir, 'b', 2, 'обычная');
    writeFileSync(join(dir, 'MEMORY.md'), '- [a](a.md)\n');
    const pinned = readPinned(dir);
    expect(pinned).toEqual([
      { file: 'a.md', text: '### Запись a — memory/a.md\nВсегда RangeError.', chars: 18 },
    ]);
    expect(readPinned(join(dir, 'missing'))).toEqual([]);
  });

  it('reports pinned records over the session start limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pin-'));
    rec(dir, 'a', 3, 'я'.repeat(PINNED_LIMIT));
    expect(pinnedOverflow(dir)).toBeNull();
    rec(dir, 'b', 3, 'ю');
    rec(dir, 'c', 2, 'э'.repeat(100));
    expect(pinnedOverflow(dir)).toContain(`${PINNED_LIMIT + 1} из ${PINNED_LIMIT}`);
    expect(pinnedOverflow(dir)).toContain('a.md (6500), b.md (1)');
  });

  it('keeps whole records within the room and reports the rest', () => {
    const items = [
      { file: 'a.md', text: 'x'.repeat(100) },
      { file: 'b.md', text: 'y'.repeat(5000) },
      { file: 'c.md', text: 'z'.repeat(100) },
    ];
    const { block, dropped } = fitPinned(items, 400);
    expect(dropped).toEqual(['b.md']);
    expect(block.length).toBeLessThanOrEqual(400);
    expect(block).toContain('x'.repeat(100));
    expect(fitPinned([], 400)).toEqual({ block: '', dropped: [] });
  });
});
