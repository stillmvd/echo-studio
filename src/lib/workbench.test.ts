import { describe, expect, it } from 'vitest';
import type { ProjectTree, WorkbenchProject } from './types';
import { type KeyInput, projectOf, samePath, terminalKey } from './workbench';

const key = (over: Partial<KeyInput>): KeyInput => ({
  type: 'keydown',
  key: '',
  code: '',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...over,
});

describe('terminalKey', () => {
  it('sends ESC+CR for Shift+Enter and Alt+Enter', () => {
    expect(terminalKey(key({ key: 'Enter', shiftKey: true }), false)).toEqual({ send: '\x1b\r' });
    expect(terminalKey(key({ key: 'Enter', altKey: true }), false)).toEqual({ send: '\x1b\r' });
    expect(terminalKey(key({ key: 'Enter' }), false)).toBeNull();
  });

  it('sends ESC v for Alt+V in any layout', () => {
    expect(terminalKey(key({ key: 'м', code: 'KeyV', altKey: true }), false)).toEqual({
      send: '\x1bv',
    });
  });

  it('copies with Ctrl+C only when text is selected', () => {
    expect(terminalKey(key({ key: 'с', code: 'KeyC', ctrlKey: true }), true)).toEqual({
      copy: true,
    });
    expect(terminalKey(key({ key: 'c', code: 'KeyC', ctrlKey: true }), false)).toBeNull();
  });

  it('leaves Ctrl+V to the native paste and Ctrl+Tab to the switcher', () => {
    expect(terminalKey(key({ code: 'KeyV', ctrlKey: true }), false)).toEqual({ native: true });
    expect(terminalKey(key({ code: 'Tab', ctrlKey: true }), false)).toEqual({ pass: true });
    expect(terminalKey(key({ code: 'Tab', ctrlKey: true, shiftKey: true }), false)).toEqual({
      pass: true,
    });
  });

  it('ignores keyup', () => {
    expect(terminalKey(key({ type: 'keyup', key: 'Enter', shiftKey: true }), false)).toBeNull();
  });
});

const proj = (path: string): WorkbenchProject => ({
  path,
  name: path.split('\\').pop() ?? path,
  group: null,
  icon: null,
  dev: null,
  mcp: null,
  hasClaudeMd: false,
});

describe('projectOf', () => {
  const tree: ProjectTree = {
    roots: [proj('C:\\P\\Solo')],
    groups: [{ name: 'G', icon: null, projects: [proj('C:\\P\\G\\App'), proj('C:\\P\\G\\App2')] }],
  };

  it('matches by path prefix without case', () => {
    expect(projectOf(tree, 'c:/p/g/app/src')?.path).toBe('C:\\P\\G\\App');
    expect(projectOf(tree, 'C:\\P\\G\\App2')?.path).toBe('C:\\P\\G\\App2');
    expect(projectOf(tree, 'C:\\P\\G\\Ap')).toBeUndefined();
    expect(projectOf(tree, null)).toBeUndefined();
  });

  it('compares paths without case and trailing slash', () => {
    expect(samePath('C:\\P\\X\\', 'c:/p/x')).toBe(true);
  });
});
