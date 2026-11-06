import { describe, expect, it, vi } from 'vitest';
import type { ContextMenuAction, ContextSubmenu, MenuItem } from '@/components/ui/ContextMenu';
import type { DevServer, ProcessRow, WorkbenchProject } from '@/lib/types';
import {
  conversationMenu,
  devTabMenu,
  processMenu,
  projectMenu,
  runningDevMenu,
  runningMenu,
  sessionTabMenu,
} from './menus';

const noop = () => {};

describe('conversationMenu', () => {
  const actions = { resume: noop, remove: noop };
  it('deletes only a conversation whose session is not running', () => {
    expect(labels(conversationMenu({ live: false, actions }))).toEqual([
      'Продолжить',
      '—',
      'Удалить сессию',
    ]);
    expect(labels(conversationMenu({ live: true, actions }))).toContain('Удалить сессию (x)');
    expect(labels(conversationMenu({ live: false, readOnly: true, actions }))).toEqual([
      'Продолжить',
    ]);
  });
});
const labels = (items: MenuItem[]) =>
  items.map((i) =>
    i === 'separator'
      ? '—'
      : 'heading' in i
        ? `# ${i.heading}`
        : i.label + ('onSelect' in i && i.disabled ? ' (x)' : ''),
  );
const find = (items: MenuItem[], label: string) =>
  items.find(
    (i): i is ContextMenuAction => i !== 'separator' && 'onSelect' in i && i.label === label,
  );

const project: WorkbenchProject = {
  path: 'C:\\Projects\\Echo',
  name: 'Echo',
  group: null,
  icon: null,
  dev: { command: 'pnpm tauri dev', kind: 'tauri' },
  mcp: null,
  hasClaudeMd: true,
  folder: false,
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
      '# Проект',
      'Открыть',
      'Новая сессия Claude',
      'Запустить dev',
      '# Файлы',
      'В Проводнике',
      'Открыть в VS Code',
      'Копировать путь',
      '—',
      'Скрыть из дерева',
    ]);
  });

  it('opens a folder without dev and without hiding it from the tree', () => {
    const folder = { ...project, dev: null, folder: true };
    expect(
      labels(projectMenu({ project: folder, server: undefined, actions: projectActions })),
    ).toEqual([
      '# Папка',
      'Открыть папку',
      'Новая сессия Claude',
      '# Файлы',
      'В Проводнике',
      'Открыть в VS Code',
      'Копировать путь',
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

  it('turns a top-level project into a group and a group folder into a project', () => {
    const actions = { ...projectActions, toggleKind: () => {} };
    expect(labels(projectMenu({ project, server: undefined, actions })).slice(-3)).toEqual([
      '—',
      'Сделать группой',
      'Скрыть из дерева',
    ]);
    const folder = { ...project, dev: null, folder: true };
    expect(labels(projectMenu({ project: folder, server: undefined, actions })).slice(-2)).toEqual([
      '—',
      'Сделать проектом',
    ]);
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
      actions: { ...actions, restart: noop },
    });
    expect(labels(items)).toEqual([
      '# Сессия',
      'Перезапустить',
      'Переподключить',
      'В ячейку…',
      'Копировать id',
      'Скрыть вкладку',
      '—',
      'Завершить сессию',
    ]);
    expect(items.at(-1)).toMatchObject({ label: 'Завершить сессию', danger: true });
    const sub = items.find((i): i is ContextSubmenu => typeof i === 'object' && 'items' in i);
    if (!sub) throw new Error('нет подменю');
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
    expect(labels(items)).not.toContain('В ячейку…');
  });

  it('an ended session can only be copied and closed', () => {
    expect(labels(sessionTabMenu({ live: false, canStop: false, cells: null, actions }))).toEqual([
      '# Сессия',
      'Копировать id',
      'Закрыть вкладку',
    ]);
  });
});

describe('devTabMenu', () => {
  const actions = { openBrowser: noop, restart: noop, copyUrl: noop, closeLog: noop, stop: noop };

  it('without a port the browser and the address are disabled', () => {
    expect(labels(devTabMenu({ server: server('starting'), actions }))).toEqual([
      '# Сайт',
      'Открыть в браузере (x)',
      'Копировать адрес (x)',
      '# Сервер',
      'Закрыть лог',
      'Перезапустить',
      '—',
      'Остановить',
    ]);
    expect(
      labels(devTabMenu({ server: server('starting'), actions: { ...actions, showLog: noop } })),
    ).toContain('Лог');
  });

  it('a dev tab can be moved to another cell', () => {
    const move = vi.fn();
    const items = devTabMenu({
      server: server('running', [1420]),
      cells: { count: 2, current: 0, move },
      actions,
    });
    const sub = items.find((i): i is ContextSubmenu => typeof i === 'object' && 'items' in i);
    if (!sub) throw new Error('нет подменю');
    expect(sub.label).toBe('В ячейку…');
    expect(labels(sub.items)).toEqual(['Ячейка 1 (x)', 'Ячейка 2']);
    find(sub.items, 'Ячейка 2')?.onSelect();
    expect(move).toHaveBeenCalledWith(1);
  });

  it('a stopped server can be started, not stopped', () => {
    expect(labels(devTabMenu({ server: server('stopped'), actions }))).toEqual([
      '# Сайт',
      'Открыть в браузере (x)',
      'Копировать адрес (x)',
      '# Сервер',
      'Закрыть лог',
      'Запустить',
    ]);
  });
});

describe('processMenu', () => {
  const row: ProcessRow = {
    pid: 10,
    startTime: 1,
    name: 'node.exe',
    memory: 1,
    cpu: 0,
    commandLine: 'node vite',
    projectPath: null,
    session: null,
    orphan: null,
    guard: null,
  };

  it('ends with kill, the folder is disabled without a project', () => {
    const kill = vi.fn();
    const items = processMenu({ row, actions: { copyCommand: noop, openFolder: noop, kill } });
    expect(labels(items)).toEqual(['Копировать команду', 'Открыть папку (x)', '—', 'Завершить']);
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
          actions: { go: noop, openBrowser: noop, restart: noop, copyUrl: noop, stop: noop },
        }),
      ),
    ).toEqual(['Перейти', 'Открыть в браузере (x)', 'Копировать адрес (x)', '—', 'Остановить']);
  });

  it('a crashed dev server can be restarted from the menu', () => {
    expect(
      labels(
        runningDevMenu({
          server: server('error'),
          actions: { go: noop, openBrowser: noop, restart: noop, copyUrl: noop, stop: noop },
        }),
      ),
    ).toEqual([
      'Перейти',
      'Открыть в браузере (x)',
      'Перезапустить',
      'Копировать адрес (x)',
      '—',
      'Остановить',
    ]);
  });
});
