import { describe, expect, it } from 'vitest';
import {
  closeInGrid,
  emptyGrid,
  gridFromTabs,
  moveInGrid,
  normalizeGrid,
  openInGrid,
  type ProjectGrid,
  resizeGrid,
  splitEdges,
  splitGrid,
} from './project-grid';

const grid = (...panes: string[][]): ProjectGrid => ({
  layout: panes.length > 2 ? '2x2' : panes.length > 1 ? '2x1' : '1x1',
  panes: panes.map((tabs) => ({ tabs, active: tabs[tabs.length - 1] })),
  focus: 0,
});

describe('project grid', () => {
  it('opens a new tab in the focused pane and focuses an open one where it lives', () => {
    const g = { ...grid(['a'], ['b']), focus: 1 };
    expect(openInGrid(g, 'c').panes[1]).toEqual({ tabs: ['b', 'c'], active: 'c' });
    const back = openInGrid(g, 'a');
    expect(back.focus).toBe(0);
    expect(back.panes.map((p) => p.tabs)).toEqual([['a'], ['b']]);
  });

  it('starts from one empty pane', () => {
    expect(openInGrid(emptyGrid(), 'a')).toEqual({
      layout: '1x1',
      panes: [{ tabs: ['a'], active: 'a' }],
      focus: 0,
    });
  });

  it('closing keeps the pane and picks the last tab', () => {
    const g = closeInGrid(grid(['a', 'b'], ['c']), 'c');
    expect(g.panes[1]).toEqual({ tabs: [], active: undefined });
    expect(closeInGrid(g, 'zzz')).toBe(g);
  });

  it('moves a tab across panes at an index and reorders within one', () => {
    const g = moveInGrid(grid(['a', 'b'], ['c', 'd']), 'a', 1, 1);
    expect(g.panes.map((p) => p.tabs)).toEqual([['b'], ['c', 'a', 'd']]);
    expect(g.focus).toBe(1);
    const same = moveInGrid(grid(['a', 'b', 'c']), 'c', 0, 0);
    expect(same.panes[0]?.tabs).toEqual(['c', 'a', 'b']);
  });

  it('splits 1x1 left and right, 2x1 top and bottom, nothing past 2x2', () => {
    expect(splitEdges('1x1')).toEqual(['left', 'right']);
    expect(splitEdges('2x2')).toEqual([]);
    const right = splitGrid(grid(['a', 'b']), 'b', 0, 'right');
    expect(right?.panes.map((p) => p.tabs)).toEqual([['a'], ['b']]);
    expect(right?.focus).toBe(1);
    const left = splitGrid(grid(['a', 'b']), 'b', 0, 'left');
    expect(left?.panes.map((p) => p.tabs)).toEqual([['b'], ['a']]);
    const below = splitGrid(grid(['a'], ['b', 'c']), 'c', 1, 'bottom');
    expect(below?.layout).toBe('2x2');
    expect(below?.panes.map((p) => p.tabs)).toEqual([['a'], ['b'], [], ['c']]);
    const above = splitGrid(grid(['a', 'x'], ['b']), 'x', 0, 'top');
    expect(above?.panes.map((p) => p.tabs)).toEqual([['x'], ['b'], ['a'], []]);
    expect(splitGrid(grid(['a'], ['b']), 'a', 0, 'right')).toBeNull();
  });

  it('will not split the only tab of a pane off itself', () => {
    expect(splitGrid(grid(['a']), 'a', 0, 'right')).toBeNull();
    expect(splitGrid(grid(['a'], ['b']), 'a', 1, 'bottom')?.panes[0]?.tabs).toEqual([]);
  });

  it('resizing grows with empty panes and shrinks by merging columns', () => {
    const up = resizeGrid(grid(['a']), '2x2');
    expect(up.panes).toHaveLength(4);
    const down = resizeGrid({ ...grid(['a'], ['b'], ['c'], ['d']), focus: 3 }, '2x1');
    expect(down.panes.map((p) => p.tabs)).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
    expect(down.focus).toBe(1);
  });

  it('normalizes stored grids: pane count, duplicates, bad active', () => {
    const g = normalizeGrid({
      layout: '2x1',
      panes: [{ tabs: ['a', 'b'], active: 'zz' }, { tabs: ['b', 'c'] }, { tabs: ['d'] }],
      focus: 9,
    });
    expect(g?.panes).toEqual([
      { tabs: ['a', 'b'], active: 'b' },
      { tabs: ['c'], active: 'c' },
    ]);
    expect(g?.focus).toBe(1);
    expect(normalizeGrid(null)).toBeNull();
  });

  it('builds a split from several active tabs', () => {
    expect(gridFromTabs(['a', 'b'], ['b']).panes).toEqual([{ tabs: ['a', 'b'], active: 'b' }]);
    const many = gridFromTabs(['a', 'b', 'c', 'd', 'e', 'f'], ['a', 'b', 'c', 'd', 'e']);
    expect(many.layout).toBe('2x2');
    expect(many.panes.map((p) => p.tabs)).toEqual([['a', 'e', 'f'], ['b'], ['c'], ['d']]);
  });
});
