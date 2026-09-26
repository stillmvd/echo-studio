import { describe, expect, it } from 'vitest';
import { countByKind, filterTools, highlightSegments } from './tooling';
import type { ToolItem } from './types';

function item(p: Partial<ToolItem> & Pick<ToolItem, 'kind' | 'qualifiedName'>): ToolItem {
  return {
    id: `${p.kind}:${p.origin ?? 'user'}:${p.qualifiedName}`,
    name: p.qualifiedName,
    description: null,
    origin: 'user',
    pluginKey: null,
    filePath: null,
    state: 'enabled',
    overrideMode: null,
    toggle: null,
    toggleHint: null,
    conflict: 'none',
    error: null,
    frontMatter: null,
    plugin: null,
    mcp: null,
    ...p,
  };
}

const items = [
  item({ kind: 'skill', qualifiedName: 'cloudflare', description: 'Workers and Pages' }),
  item({ kind: 'skill', qualifiedName: 'grill-me', origin: 'project' }),
  item({ kind: 'mcp', qualifiedName: 'chrome-devtools', origin: 'local' }),
  item({ kind: 'plugin', qualifiedName: 'ponytail@ponytail', origin: 'plugin' }),
];

describe('tooling filters', () => {
  it('filters by kind and query over name and description', () => {
    expect(filterTools(items, { kind: 'skill', query: '' })).toHaveLength(2);
    expect(filterTools(items, { kind: 'all', query: 'WORKERS' }).map((i) => i.name)).toEqual([
      'cloudflare',
    ]);
    expect(filterTools(items, { kind: 'mcp', query: 'cloud' })).toHaveLength(0);
  });

  it('keeps only project and local items when asked', () => {
    expect(
      filterTools(items, { kind: 'all', query: '', projectOnly: true }).map((i) => i.origin),
    ).toEqual(['project', 'local']);
  });

  it('counts kinds', () => {
    expect(countByKind(items)).toEqual({
      all: 4,
      skill: 2,
      command: 0,
      agent: 0,
      plugin: 1,
      mcp: 1,
    });
  });

  it('splits text into highlight segments', () => {
    expect(highlightSegments('Cloud cloud', 'cloud')).toEqual([
      { text: 'Cloud', hit: true },
      { text: ' ', hit: false },
      { text: 'cloud', hit: true },
    ]);
    expect(highlightSegments('abc', ' ')).toEqual([{ text: 'abc', hit: false }]);
  });
});
