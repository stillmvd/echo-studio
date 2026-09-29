import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { doneStatus, recordFiles, startStatus } from './status.mjs';

describe('status lines', () => {
  it('summarises memory at session start', () => {
    expect(
      startStatus({
        records: 53,
        pinned: 2,
        last: { date: '2026-09-29', title: 'Дубли и слияние', next: 'T054' },
        problems: [],
      }),
    ).toBe(
      'Память: 53 записи · 2 закреплены · прошлая сессия 29 сен «Дубли и слияние» → дальше: T054',
    );
    expect(
      startStatus({ records: 1, pinned: 0, last: null, problems: ['черновик без итога'] }),
    ).toBe('Память: 1 запись · ⚠ черновик без итога');
    expect(startStatus({ records: 0, pinned: 0, last: null, problems: [] })).toMatch(/пока пусто/);
  });

  it('reports new records after the summary', () => {
    const dir = mkdtempSync(join(tmpdir(), 'status-'));
    mkdirSync(join(dir, 'sessions'));
    writeFileSync(join(dir, 'old.md'), '---\nname: old\n---\n');
    const before = recordFiles(dir);
    const note = join(dir, 'sessions', 'n.md');
    expect(doneStatus(dir, note, before)).toMatch(/не записан/);
    writeFileSync(note, '---\nname: n\n---\n');
    expect(doneStatus(dir, note, before)).toBe('Память: итог сессии записан');
    writeFileSync(join(dir, 'a.md'), '---\nname: a\nmetadata:\n  kind: gotcha\n---\n');
    writeFileSync(join(dir, 'b.md'), '---\nname: b\n---\n');
    expect(doneStatus(dir, note, before)).toBe('Память: итог сессии записан · +2 записи (gotcha)');
  });
});
