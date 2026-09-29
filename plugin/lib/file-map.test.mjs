import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFileMap, recordsFor } from './file-map.mjs';

describe('file map', () => {
  it('maps files: of records to their descriptions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fm-'));
    writeFileSync(
      join(dir, 'a.md'),
      '---\nname: a\ndescription: Грабли App\nmetadata:\n  files:\n    - src/App.tsx\n    - .\\src\\lib\\ipc.ts\n---\n',
    );
    writeFileSync(join(dir, 'b.md'), '---\nname: b\ndescription: без файлов\n---\n');
    writeFileSync(join(dir, 'MEMORY.md'), '- [a](a.md)\n');
    const map = buildFileMap(dir);
    expect(Object.keys(map).sort()).toEqual(['src/app.tsx', 'src/lib/ipc.ts']);
    const root = 'C:\\proj';
    expect(recordsFor(map, root, 'C:\\proj\\src\\App.tsx').entries[0].description).toBe(
      'Грабли App',
    );
    expect(recordsFor(map, root, 'C:\\other\\src\\App.tsx').entries).toEqual([]);
    expect(buildFileMap(join(dir, 'missing'))).toEqual({});
  });
});
