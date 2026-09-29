import { describe, expect, it } from 'vitest';
import { buildDraft } from './draft.mjs';
import { parse } from './frontmatter.mjs';

describe('buildDraft', () => {
  it('builds an extractive note from the session state', () => {
    const text = buildDraft(
      {
        first_prompt: 'Сделай "раздел" памяти\nподробности',
        recent: [
          { role: 'user', text: 'ок' },
          { role: 'assistant', text: 'Готово:\nсобрал' },
        ],
        touched: ['src/a.ts', 'C:\\Users\\u\\.claude\\projects\\C--p\\memory\\sessions\\s.md'],
      },
      'ab12cd34-ffff',
      new Date('2026-09-29T10:00:00Z'),
    );
    const { fields, body, error } = parse(text);
    expect(error).toBeNull();
    expect(fields.description).toBe("Черновик: Сделай 'раздел' памяти");
    expect(fields.metadata).toMatchObject({ capture: 'extractive', session_id: 'ab12cd34-ffff' });
    expect(body).toContain('- **Claude:** Готово: собрал');
    expect(body).toContain('- `src/a.ts`');
    expect(body).not.toContain('memory');
  });

  it('survives an empty state', () => {
    const text = buildDraft({ first_prompt: null, recent: [], touched: [] }, 'x');
    expect(text).toContain('Сессия без итога');
  });
});
