import {
  ArrowRight,
  Code,
  Copy,
  EyeOff,
  FolderCode,
  FolderOpen,
  Folders,
  Globe,
  History,
  Link,
  Maximize2,
  MessageSquare,
  Minimize2,
  MoveRight,
  Play,
  Plus,
  Power,
  RotateCcw,
  Square,
  SquareTerminal,
  Trash2,
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
  agent = 'Claude',
  actions,
}: {
  project: WorkbenchProject;
  server: DevServer | undefined;
  busy?: boolean;
  agent?: string;
  actions: {
    open: () => void;
    newSession: () => void;
    startDev: () => void;
    stopDev: () => void;
    reveal: () => void;
    vscode: () => void;
    copyPath: () => void;
    hide: () => void;
    toggleKind?: () => void;
  };
}): MenuItem[] {
  const dev: MenuItem[] = !project.dev
    ? []
    : devRuns(server)
      ? [action('Остановить dev', Square, actions.stopDev)]
      : [action('Запустить dev', Play, actions.startDev)];
  const kind: MenuItem[] = actions.toggleKind
    ? [
        project.folder
          ? action('Сделать проектом', FolderCode, actions.toggleKind)
          : action('Сделать группой', Folders, actions.toggleKind),
      ]
    : [];
  const hide: MenuItem[] = project.folder
    ? kind.length
      ? ['separator', ...kind]
      : []
    : ['separator', ...kind, action('Скрыть из дерева', EyeOff, actions.hide)];
  return [
    { heading: project.folder ? 'Папка' : 'Проект' },
    action(project.folder ? 'Открыть папку' : 'Открыть', ArrowRight, actions.open),
    action(`Новая сессия ${agent}`, Plus, actions.newSession, { disabled: busy }),
    ...dev,
    { heading: 'Файлы' },
    action('В Проводнике', FolderOpen, actions.reveal),
    action('Открыть в VS Code', Code, actions.vscode),
    action('Копировать путь', Copy, actions.copyPath),
    ...hide,
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
      label: 'В ячейку…',
      icon: icon(MoveRight),
      items: Array.from({ length: cells.count }, (_, i) =>
        action(`Ячейка ${i + 1}`, SquareTerminal, () => cells.move(i), {
          disabled: i === cells.current,
        }),
      ),
    },
  ];
}

export interface ZoomToggle {
  zoomed: boolean;
  toggle: () => void;
}

function zoomItem(zoom: ZoomToggle | null): MenuItem[] {
  if (!zoom) return [];
  return [
    zoom.zoomed
      ? action('Вернуть сетку', Minimize2, zoom.toggle)
      : action('Развернуть ячейку', Maximize2, zoom.toggle),
  ];
}

export function newTabMenu({
  agent,
  busy,
  dev,
  resume,
  actions,
}: {
  agent: string;
  busy: boolean;
  dev: { runs: boolean; open: () => void; start: () => void } | null;
  resume: { title: string; start: () => void }[];
  actions: { newSession: () => void };
}): MenuItem[] {
  const devItem: MenuItem[] = !dev
    ? []
    : [dev.runs ? action('Лог', SquareTerminal, dev.open) : action('Запустить', Play, dev.start)];
  const resumeItem: MenuItem[] = resume.length
    ? [
        {
          label: 'Продолжить',
          icon: icon(History),
          items: resume.map((r) => action(r.title, MessageSquare, r.start, { disabled: busy })),
        },
      ]
    : [];
  return [
    { heading: 'Сессия' },
    action(`Новая сессия ${agent}`, Plus, actions.newSession, { disabled: busy }),
    ...resumeItem,
    ...(devItem.length ? [{ heading: 'Сервер' }, ...devItem] : []),
  ];
}

export function sessionTabMenu({
  live,
  canStop,
  cells,
  zoom = null,
  actions,
}: {
  live: boolean;
  canStop: boolean;
  cells: MoveTargets | null;
  zoom?: ZoomToggle | null;
  actions: {
    restart?: () => void;
    reconnect: () => void;
    copyId: () => void;
    hide: () => void;
  };
}): MenuItem[] {
  const restart =
    canStop && actions.restart ? [action('Перезапустить', RotateCcw, actions.restart)] : [];
  return [
    { heading: 'Сессия' },
    ...restart,
    ...(canStop ? [action('Переподключить', Link, actions.reconnect)] : []),
    ...moveTo(cells),
    ...zoomItem(zoom),
    action('Копировать id', Copy, actions.copyId),
    action(live ? 'Скрыть вкладку' : 'Закрыть вкладку', X, actions.hide),
  ];
}

export function devTabMenu({
  server,
  cells = null,
  zoom = null,
  actions,
}: {
  server: DevServer | undefined;
  cells?: MoveTargets | null;
  zoom?: ZoomToggle | null;
  actions: {
    openBrowser: () => void;
    restart: () => void;
    copyUrl: () => void;
    closeLog: () => void;
    showLog?: () => void;
  };
}): MenuItem[] {
  const url = devUrl(server);
  const port = server?.ports[0];
  return [
    { heading: 'Сайт' },
    action('Открыть в браузере', Globe, actions.openBrowser, {
      disabled: !url,
      hint: port ? `:${port}` : undefined,
    }),
    action('Копировать адрес', Link, actions.copyUrl, { disabled: !url }),
    { heading: 'Сервер' },
    ...moveTo(cells),
    ...zoomItem(zoom),
    actions.showLog
      ? action('Лог', SquareTerminal, actions.showLog)
      : action('Закрыть лог', X, actions.closeLog),
    ...(devRuns(server) ? [action('Перезапустить', RotateCcw, actions.restart)] : []),
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
    action('Копировать команду', Copy, actions.copyCommand, {
      disabled: !row.commandLine,
    }),
    action('Открыть папку', FolderOpen, actions.openFolder, {
      disabled: !row.projectPath,
    }),
    ...danger('Завершить', Power, actions.kill),
  ];
}

export function conversationMenu({
  live,
  busy,
  readOnly,
  actions,
}: {
  live: boolean;
  busy?: boolean;
  readOnly?: boolean;
  actions: { resume: () => void; remove: () => void };
}): MenuItem[] {
  const resume = action('Продолжить', Play, actions.resume, { disabled: busy });
  if (readOnly) return [resume];
  return [
    resume,
    'separator',
    action('Удалить сессию', Trash2, actions.remove, {
      danger: true,
      disabled: live,
      hint: live ? 'Сессия запущена' : undefined,
    }),
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
  actions: {
    go: () => void;
    openBrowser: () => void;
    restart: () => void;
    copyUrl: () => void;
    stop: () => void;
  };
}): MenuItem[] {
  const health = devHealth(server);
  return [
    action('Перейти', ArrowRight, actions.go),
    action('Открыть в браузере', Globe, actions.openBrowser, { disabled: !devUrl(server) }),
    ...(health === 'crashed' || health === 'errors'
      ? [action('Перезапустить', RotateCcw, actions.restart)]
      : []),
    action('Копировать адрес', Link, actions.copyUrl, { disabled: !devUrl(server) }),
    ...(devRuns(server) ? danger('Остановить', Square, actions.stop) : []),
  ];
}
