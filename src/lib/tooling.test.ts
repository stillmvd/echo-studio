import { describe, expect, it } from 'vitest';
import {
  applyToggle,
  countByKind,
  filterTools,
  groupSkills,
  highlightSegments,
  nestOverrides,
  samePath,
} from './tooling';
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

describe('applyToggle', () => {
  const target = {
    file: 'userSettings' as const,
    projectPath: null,
    key: 'enabledPlugins' as const,
    name: 'pony@mkt',
  };
  const list = [
    item({ kind: 'plugin', qualifiedName: 'pony@mkt', origin: 'plugin', toggle: target }),
    item({ kind: 'skill', qualifiedName: 'pony:lazy', origin: 'plugin', pluginKey: 'pony@mkt' }),
    item({ kind: 'skill', qualifiedName: 'other' }),
  ];

  it('turns a plugin and its items off and back on', () => {
    const off = applyToggle(list, target, false);
    expect(off.map((i) => i.state)).toEqual(['disabled', 'unavailable', 'enabled']);
    expect(applyToggle(off, target, true).map((i) => i.state)).toEqual([
      'enabled',
      'enabled',
      'enabled',
    ]);
  });
});

describe('nestOverrides', () => {
  it('puts the overridden item right under its winner', () => {
    const list = [
      item({ kind: 'mcp', qualifiedName: 'a' }),
      item({ kind: 'mcp', qualifiedName: 'dup', conflict: 'overridden' }),
      item({ kind: 'mcp', qualifiedName: 'z' }),
      item({ kind: 'mcp', qualifiedName: 'dup', origin: 'project', conflict: 'overrides' }),
    ];
    expect(nestOverrides(list).map((i) => `${i.name}:${i.origin}`)).toEqual([
      'a:user',
      'z:user',
      'dup:project',
      'dup:user',
    ]);
  });

  it('keeps an overridden item when its winner is filtered out', () => {
    const lone = [item({ kind: 'agent', qualifiedName: 'r', conflict: 'overridden' })];
    expect(nestOverrides(lone)).toHaveLength(1);
  });
});

describe('samePath', () => {
  it('ignores case, slash style and a trailing slash', () => {
    expect(samePath('c:/Users/X/p', 'C:\\users\\x\\P\\')).toBe(true);
    expect(samePath('C:/a/b', 'C:/a/bc')).toBe(false);
  });
});

describe('groupSkills', () => {
  const s = (name: string, plugin?: string) =>
    item({
      kind: 'skill',
      qualifiedName: plugin ? `${plugin}:${name}` : name,
      name,
      origin: plugin ? 'plugin' : 'user',
      pluginKey: plugin ? `${plugin}@mkt` : null,
    });
  const all = [
    s('gsd'),
    s('gsd-next'),
    s('gsd-plan'),
    s('better-ui'),
    s('better-colors'),
    s('audit', 'chisle'),
    s('zeta'),
  ];
  const shape = (rows: ReturnType<typeof groupSkills>) =>
    rows.map((r) => (r.type === 'group' ? `[${r.title} ${r.count}]` : r.item.name));

  it('groups plugins and prefixes with 3+ skills, closed by default', () => {
    expect(shape(groupSkills(all, all, new Set(), false))).toEqual([
      'better-colors',
      'better-ui',
      '[chisle 1]',
      '[gsd 3]',
      'zeta',
    ]);
  });

  it('shows members of open groups', () => {
    expect(shape(groupSkills(all, all, new Set(['prefix:gsd']), false))).toEqual([
      'better-colors',
      'better-ui',
      '[chisle 1]',
      '[gsd 3]',
      'gsd',
      'gsd-next',
      'gsd-plan',
      'zeta',
    ]);
  });

  it('keeps groups from the full list while searching and opens them', () => {
    const shown = all.filter((i) => i.name === 'gsd-next');
    expect(shape(groupSkills(all, shown, new Set(), true))).toEqual(['[gsd 1]', 'gsd-next']);
  });
});
