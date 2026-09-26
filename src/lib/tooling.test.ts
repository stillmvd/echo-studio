import { describe, expect, it } from 'vitest';
import {
  alsoInProjects,
  applyToggle,
  copiesFor,
  copyHash,
  countByKind,
  filterTools,
  groupSkills,
  highlightSegments,
  nestOverrides,
  samePath,
  splitInherited,
} from './tooling';
import type { ToolCopy, ToolItem } from './types';

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
    overriddenBy: null,
    overrides: [],
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

function copy(
  kind: ToolCopy['scope']['kind'],
  label: string,
  filePath: string,
  hash: string,
  name = 'stand',
): ToolCopy {
  return {
    kind: 'command',
    name,
    scope: { kind, path: kind === 'project' ? `C:/p/${label}` : null, label },
    filePath,
    hash,
    modifiedMs: 1,
  };
}

describe('copies', () => {
  const copies = [
    copy('project', 'b', 'C:/p/b/.claude/commands/stand.md', 'x'),
    copy('global', 'Global', 'C:/h/.claude/commands/stand.md', 'y'),
    copy('project', 'a', 'C:/p/a/.claude/commands/stand.md', 'x'),
    copy('project', 'c', 'C:/p/c/.claude/commands/Stand.md', 'z', 'Stand'),
    copy('plugin', 'kit', 'C:/k/commands/other.md', 'x', 'other'),
  ];
  const mine = item({
    kind: 'command',
    qualifiedName: 'stand',
    origin: 'project',
    filePath: 'C:\\p\\a\\.claude\\commands\\stand.md',
  });

  it('lists other places, global first, current file and scope excluded', () => {
    expect(copiesFor(mine, copies, 'C:/p/a').map((c) => c.scope.label)).toEqual([
      'Global',
      'b',
      'c',
    ]);
    expect(copyHash(mine, copies)).toBe('x');
  });

  it('counts other projects only for own tools', () => {
    expect(alsoInProjects(mine, copies, 'C:/p/a')).toBe(2);
    expect(alsoInProjects({ ...mine, origin: 'user' }, copies, 'C:/p/a')).toBe(0);
  });

  it('splits own from inherited', () => {
    const { own, inherited } = splitInherited([
      mine,
      item({ kind: 'mcp', qualifiedName: 'l', origin: 'local' }),
      item({ kind: 'skill', qualifiedName: 'g' }),
      item({ kind: 'skill', qualifiedName: 'p', origin: 'plugin' }),
    ]);
    expect(own.map((i) => i.name)).toEqual(['stand', 'l']);
    expect(inherited.map((i) => i.name)).toEqual(['g', 'p']);
  });
});
