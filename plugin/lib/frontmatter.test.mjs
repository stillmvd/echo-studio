import { describe, expect, it } from 'vitest';
import { field, parse } from './frontmatter.mjs';

describe('parse', () => {
  it('reads scalars, lists and nested metadata', () => {
    const { fields, body, error } = parse(
      '---\r\nname: a-b\r\ndescription: "Одна строка: с двоеточием"\r\nmetadata:\r\n  type: project\r\nseen: 2\r\nfiles:\r\n  - src/a.ts\r\n  - src/b.ts\r\ntags: [x, "y"]\r\n---\r\n\r\nТело\r\n',
    );
    expect(error).toBeNull();
    expect(fields).toEqual({
      name: 'a-b',
      description: 'Одна строка: с двоеточием',
      metadata: { type: 'project' },
      seen: 2,
      files: ['src/a.ts', 'src/b.ts'],
      tags: ['x', 'y'],
    });
    expect(body).toBe('\nТело\n');
  });

  it('tolerates invalid YAML line by line', () => {
    const { fields } = parse('---\nname: x\ndescription: a: b: {c\n---\n');
    expect(fields.description).toBe('a: b: {c');
  });

  it('reports an unclosed block and passes plain markdown through', () => {
    expect(parse('---\nname: x\n').error).toBe('frontmatter is not closed');
    expect(parse('# Title\n').fields).toEqual({});
  });
});

describe('field', () => {
  it('prefers metadata and falls back to the top level', () => {
    expect(field({ metadata: { seen: 2 }, seen: 1 }, 'seen')).toBe(2);
    expect(field({ seen: 1 }, 'seen')).toBe(1);
    expect(field({ metadata: null }, 'seen')).toBeUndefined();
  });
});

describe('parse normalized auto memory', () => {
  it('reads lists and comments nested in metadata', () => {
    const { fields } = parse(
      `${String.fromCharCode(0xfeff)}---\nname: x\ndescription: d\nmetadata:\n  type: project  # или user\n  seen: 2\n  files:\n    - src/a.ts\n    - src/b.ts\n  tags: [a]\nimportance: 3\n---\nbody`,
    );
    expect(fields.metadata).toEqual({
      type: 'project',
      seen: 2,
      files: ['src/a.ts', 'src/b.ts'],
      tags: ['a'],
    });
    expect(field(fields, 'files')).toEqual(['src/a.ts', 'src/b.ts']);
    expect(fields.importance).toBe(3);
  });
});
