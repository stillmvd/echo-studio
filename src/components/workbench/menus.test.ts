import { describe, expect, it, vi } from 'vitest';
import type { ContextMenuAction, ContextSubmenu, MenuItem } from '@/components/ui/ContextMenu';
import type { DevServer, ProcessRow, WorkbenchProject } from '@/lib/types';
import {
  devTabMenu,
  processMenu,
  projectMenu,
  runningDevMenu,
  runningMenu,
  sessionTabMenu,
} from './menus';

const noop = () => {};
const labels = (items: MenuItem[]) =>
  items.map((i) =>
    i === 'separator' ? '—' : i.label + ('onSelect' in i && i.disabled ? ' (x)' : ''),
  );
const find = (items: MenuItem[], label: string) =>
  items.find(
    (i): i is ContextMenuAction => i !== 'separator' && i.label === label && 'onSelect' in i,
  );

const project: WorkbenchProject = {
  path: 'C:\\Projects\\Echo',
  name: 'Echo',
  group: null,
  icon: null,
  dev: { command: 'pnpm tauri dev', kind: 'tauri' },
  mcp: null,
  hasClaudeMd: true,
};

const server = (state: DevServer['state'], ports: number[] = []): DevServer => ({
  projectPath: project.path,
  command: 'pnpm tauri dev',
  errors: null,
  restarted: false,
  state,
  ports,
  startedAt: 0,
  exitCode: null,
  log: '',
  pids: state === 'stopped' ? [] : [1],
});

const projectActions = {
  open: noop,
  newSession: noop,
  startDev: noop,
  stopDev: noop,
  reveal: noop,
  vscode: noop,
  copyPath: noop,
  hide: noop,
};

describe('projectMenu', () => {
  it('lists project actions with hide last under a line', () => {
    expect(labels(projectMenu({ project, server: undefined, actions: projectActions }))).toEqual([
      'Открыть',
      'Новая сессия Claude',
      'Запустить dev',
      '—',
      'Открыть в проводнике',
      'Открыть в VS Code',
      'Копировать путь',
      '—',
      'Скрыть из дерева',
    ]);
  });

  it('offers stopping a running dev and nothing for a project without dev', () => {
    const running = projectMenu({
      project,
      server: server('running', [1420]),
      actions: projectActions,
    });
    expect(labels(running)).toContain('Остановить dev');
    const plain = projectMenu({
      project: { ...project, dev: null },
      server: undefined,
      actions: projectActions,
    });
    expect(labels(plain).some((l) => l.includes('dev'))).toBe(false);
  });

  it('blocks a new session while one is starting', () => {
    const items = projectMenu({ project, server: undefined, busy: true, actions: projectActions });
    expect(find(items, 'Новая сессия Claude')?.disabled).toBe(true);
  });
});

describe('sessionTabMenu', () => {
  const actions = { reconnect: noop, copyId: noop, hide: noop, stop: noop };

  it('a live session ends with a dangerous stop', () => {
    const move = vi.fn();
    const items = sessionTabMenu({
      live: true,
      canStop: true,
      cells: { count: 4, current: 1, move },
      actions,
    });
    expect(labels(items)).toEqual([
      'Переместить в ячейку…',
      'Переподключить',
      'Копировать id',
      'Скрыть вкладку',
      '—',
      'Завершить сессию',
    ]);
    expect(items.at(-1)).toMatchObject({ label: 'Завершить сессию', danger: true });
    const sub = items[0] as ContextSubmenu;
    expect(labels(sub.items)).toEqual(['Ячейка 1', 'Ячейка 2 (x)', 'Ячейка 3', 'Ячейка 4']);
    find(sub.items, 'Ячейка 3')?.onSelect();
    expect(move).toHaveBeenCalledWith(2);
  });

  it('a single cell layout has nothing to move to', () => {
    const items = sessionTabMenu({
      live: true,
      canStop: true,
      cells: { count: 1, current: 0, move: noop },
      actions,
    });
    expect(labels(items)).not.toContain('Переместить в ячейку…');
  });

  it('an ended session can only be copied and closed', () => {
    expect(labels(sessionTabMenu({ live: false, canStop: false, cells: null, actions }))).toEqual([
      'Копировать id',
      'Закрыть вкладку',
    ]);
  });
});

describe('devTabMenu', () => {
  const actions = { openBrowser: noop, restart: noop, copyUrl: noop, closeLog: noop, stop: noop };

  it('without a port the browser and the address are disabled', () => {
    expect(labels(devTabMenu({ server: server('starting'), actions }))).toEqual([
      'Открыть в браузере (x)',
      'Перезапустить',
      'Копировать адрес (x)',
      'Закрыть лог',
      '—',
      'Остановить',
    ]);
  });

  it('a dev tab can be moved to another cell', () => {
    const move = vi.fn();
    const items = devTabMenu({
      server: server('running', [1420]),
      cells: { count: 2, current: 0, move },
      actions,
    });
    const sub = items[0] as ContextSubmenu;
    expect(sub.label).toBe('Переместить в ячейку…');
    expect(labels(sub.items)).toEqual(['Ячейка 1 (x)', 'Ячейка 2']);
    find(sub.items, 'Ячейка 2')?.onSelect();
    expect(move).toHaveBeenCalledWith(1);
  });

  it('a stopped server can be started, not stopped', () => {
    expect(labels(devTabMenu({ server: server('stopped'), actions }))).toEqual([
      'Открыть в браузере (x)',
      'Запустить',
      'Копировать адрес (x)',
      'Закрыть лог',
    ]);
  });
});

describe('processMenu', () => {
  const row: ProcessRow = {
    pid: 10,
    startTime: 1,
    name: 'node.exe',
    memory: 1,
    commandLine: 'node vite',
    projectPath: null,
    session: null,
    orphan: null,
    guard: null,
  };

  it('ends with kill, the folder is disabled without a project', () => {
    const kill = vi.fn();
    const items = processMenu({ row, actions: { copyCommand: noop, openFolder: noop, kill } });
    expect(labels(items)).toEqual([
      'Копировать командную строку',
      'Открыть папку проекта (x)',
      '—',
      'Завершить',
    ]);
    find(items, 'Завершить')?.onSelect();
    expect(kill).toHaveBeenCalledOnce();
  });
});

describe('runningMenu', () => {
  const actions = { go: noop, copyId: noop, stop: noop };

  it('an external session shows its window and cannot be stopped', () => {
    expect(labels(runningMenu({ external: true, canStop: false, actions }))).toEqual([
      'Показать окно',
      'Копировать id',
    ]);
  });

  it('a shell session can be stopped', () => {
    expect(labels(runningMenu({ external: false, canStop: true, actions })).at(-1)).toBe(
      'Завершить сессию',
    );
  });

  it('a dev server without a port has no address', () => {
    expect(
      labels(
        runningDevMenu({
          server: server('running'),
          actions: { go: noop, copyUrl: noop, stop: noop },
        }),
      ),
    ).toEqual(['Перейти', 'Копировать адрес (x)', '—', 'Остановить']);
  });
});
