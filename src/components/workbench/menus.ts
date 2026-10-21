import {
  ArrowRight,
  Code,
  Copy,
  EyeOff,
  FolderOpen,
  Globe,
  Link,
  MoveRight,
  Play,
  Plus,
  Power,
  RotateCcw,
  Square,
  SquareTerminal,
  X,
} from 'lucide-react';
import { createElement, type ElementType } from 'react';
import type { ContextMenuAction, MenuItem } from '@/components/ui/ContextMenu';
import type { ClaudeSession, DevServer, ProcessRow, WorkbenchProject } from '@/lib/types';
import { devHealth } from '@/lib/workbench';

const icon = (Icon: ElementType) => createElement(Icon, { strokeWidth: 2 });

const action = (
  label: string,
  Icon: ElementType,
  onSelect: () => void,
  extra?: Partial<ContextMenuAction>,
): ContextMenuAction => ({ label, icon: icon(Icon), onSelect, ...extra });

const danger = (label: string, Icon: ElementType, onSelect: () => void): MenuItem[] => [
  'separator',
  action(label, Icon, onSelect, { danger: true }),
];

export const copyText = (text: string) => void navigator.clipboard.writeText(text).catch(() => {});

export const canStopSession = (s: ClaudeSession) =>
  s.kind === 'shell' && !!s.shortId && !!s.projectPath && s.status !== 'exited';

export const devUrl = (server: DevServer | undefined) =>
  server?.ports[0] ? `http://localhost:${server.ports[0]}` : null;

export const devRuns = (server: DevServer | undefined) =>
  !!server && (server.state === 'running' || server.state === 'starting' || server.pids.length > 0);

export function projectMenu({
  project,
  server,
  busy,
  actions,
}: {
  project: WorkbenchProject;
  server: DevServer | undefined;
  busy?: boolean;
  actions: {
    open: () => void;
    newSession: () => void;
    startDev: () => void;
    stopDev: () => void;
    reveal: () => void;
    vscode: () => void;
    copyPath: () => void;
    hide: () => void;
  };
}): MenuItem[] {
  const dev: MenuItem[] = !project.dev
    ? []
    : devRuns(server)
      ? [action('Остановить dev', Square, actions.stopDev)]
      : [action('Запустить dev', Play, actions.startDev)];
  return [
    action('Открыть', ArrowRight, actions.open),
    action('Новая сессия Claude', Plus, actions.newSession, { disabled: busy }),
    ...dev,
    'separator',
    action('Открыть в проводнике', FolderOpen, actions.reveal),
    action('Открыть в VS Code', Code, actions.vscode),
    action('Копировать путь', Copy, actions.copyPath),
    'separator',
    action('Скрыть из дерева', EyeOff, actions.hide),
  ];
}

export interface MoveTargets {
  count: number;
  current: number;
  move: (index: number) => void;
}

function moveTo(cells: MoveTargets | null): MenuItem[] {
  if (!cells || cells.count < 2) return [];
  return [
    {
      label: 'Переместить в ячейку…',
      icon: icon(MoveRight),
      items: Array.from({ length: cells.count }, (_, i) =>
        action(`Ячейка ${i + 1}`, SquareTerminal, () => cells.move(i), {
          disabled: i === cells.current,
        }),
      ),
    },
  ];
}

export function sessionTabMenu({
  live,
  canStop,
  cells,
  actions,
}: {
  live: boolean;
  canStop: boolean;
  cells: MoveTargets | null;
  actions: { reconnect: () => void; copyId: () => void; hide: () => void; stop: () => void };
}): MenuItem[] {
  return [
    ...moveTo(cells),
    ...(canStop ? [action('Переподключить', RotateCcw, actions.reconnect)] : []),
    action('Копировать id', Copy, actions.copyId),
    action(live ? 'Скрыть вкладку' : 'Закрыть вкладку', X, actions.hide),
    ...(canStop ? danger('Завершить сессию', Square, actions.stop) : []),
  ];
}

export function devTabMenu({
  server,
  cells = null,
  actions,
}: {
  server: DevServer | undefined;
  cells?: MoveTargets | null;
  actions: {
    openBrowser: () => void;
    restart: () => void;
    copyUrl: () => void;
    closeLog: () => void;
    stop: () => void;
  };
}): MenuItem[] {
  const url = devUrl(server);
  const runs = devRuns(server);
  return [
    ...moveTo(cells),
    action('Открыть в браузере', Globe, actions.openBrowser, { disabled: !url }),
    runs
      ? action('Перезапустить', RotateCcw, actions.restart)
      : action('Запустить', Play, actions.restart),
    action('Копировать адрес', Link, actions.copyUrl, { disabled: !url }),
    action('Закрыть лог', X, actions.closeLog),
    ...(runs ? danger('Остановить', Square, actions.stop) : []),
  ];
}

export function processMenu({
  row,
  actions,
}: {
  row: ProcessRow;
  actions: { copyCommand: () => void; openFolder: () => void; kill: () => void };
}): MenuItem[] {
  return [
    action('Копировать командную строку', Copy, actions.copyCommand, {
      disabled: !row.commandLine,
    }),
    action('Открыть папку проекта', FolderOpen, actions.openFolder, {
      disabled: !row.projectPath,
    }),
    ...danger('Завершить', Power, actions.kill),
  ];
}

export function runningMenu({
  external,
  canStop,
  actions,
}: {
  external: boolean;
  canStop: boolean;
  actions: { go: () => void; copyId: () => void; stop: () => void };
}): MenuItem[] {
  return [
    action(external ? 'Показать окно' : 'Перейти', ArrowRight, actions.go),
    action('Копировать id', Copy, actions.copyId),
    ...(canStop ? danger('Завершить сессию', Square, actions.stop) : []),
  ];
}

export function runningDevMenu({
  server,
  actions,
}: {
  server: DevServer;
  actions: { go: () => void; restart: () => void; copyUrl: () => void; stop: () => void };
}): MenuItem[] {
  const health = devHealth(server);
  return [
    action('Перейти', ArrowRight, actions.go),
    ...(health === 'crashed' || health === 'errors'
      ? [action('Перезапустить', RotateCcw, actions.restart)]
      : []),
    action('Копировать адрес', Link, actions.copyUrl, { disabled: !devUrl(server) }),
    ...(devRuns(server) ? danger('Остановить', Square, actions.stop) : []),
  ];
}
