import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLOSE, fitLines, OPEN, readSessions, sessionLine, upsertBlock } from './index-block.mjs';

function note(dir, name, updated, extra = '') {
  const file = join(dir, 'sessions', name);
  writeFileSync(
    file,
    `---\nname: session-x\ndescription: "Сессия ${name}"\nmetadata:\n  capture: ${extra || 'claude'}\n  updated: ${updated}\n---\n\n## Запрос\nx\n\n## Дальше\n- дописать тесты\n- потом стенд\n`,
  );
  const t = new Date(updated);
  utimesSync(file, t, t);
}

describe('readSessions', () => {
  it('returns the newest notes with title and next step, skipping broken ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mem-'));
    mkdirSync(join(dir, 'sessions'));
    for (let d = 1; d <= 10; d++) {
      note(
        dir,
        `2026-09-${String(d).padStart(2, '0')}_aaaa000${d % 10}.md`,
        `2026-09-${String(d).padStart(2, '0')}T10:00:00Z`,
      );
    }
    writeFileSync(join(dir, 'sessions', '2026-09-30_broken00.md'), '---\nname: x\n');
    const notes = readSessions(dir, 10).slice(0, 3);
    expect(notes.map((n) => n.date)).toEqual(['2026-09-10', '2026-09-09', '2026-09-08']);
    expect(sessionLine(notes[0])).toBe(
      '- [2026-09-10 — Сессия 2026-09-10_aaaa0000.md](sessions/2026-09-10_aaaa0000.md) — дальше: дописать тесты',
    );
  });

  it('is empty without a sessions folder', () => {
    expect(readSessions(mkdtempSync(join(tmpdir(), 'mem-')), 3)).toEqual([]);
  });
});

describe('upsertBlock', () => {
  it('replaces only the block and keeps the rest byte for byte (CRLF)', () => {
    const md = `# Память\r\n- [a](a.md) — x\r\n\r\n${OPEN}\r\n- старое\r\n${CLOSE}\r\nхвост\r\n`;
    const out = upsertBlock(md, ['- новое']);
    expect(out).toBe(
      `# Память\r\n- [a](a.md) — x\r\n\r\n${OPEN}\r\n- новое\r\n${CLOSE}\r\nхвост\r\n`,
    );
  });

  it('appends a block when markers are missing', () => {
    expect(upsertBlock('- [a](a.md) — x', ['- s'])).toBe(
      `- [a](a.md) — x\n\n${OPEN}\n- s\n${CLOSE}\n`,
    );
    expect(upsertBlock('', [])).toBe(`${OPEN}\n${CLOSE}\n`);
  });
});

describe('fitLines', () => {
  it('keeps whole lines within the limit', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `${i}`.padEnd(100, 'x'));
    const kept = fitLines(lines, 8000);
    expect(kept.join('\n').length).toBeLessThanOrEqual(8000);
    expect(kept).toHaveLength(79);
  });
});
