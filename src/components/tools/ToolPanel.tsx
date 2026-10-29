import { open } from '@tauri-apps/plugin-shell';
import { Check, ChevronRight, X } from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import explorerIcon from '@/assets/apps/explorer.png';
import zedIcon from '@/assets/apps/zed.png';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { tooltip } from '@/components/ui/Tooltip';
import { useDeleteTool, useSetToolEnabled, useUpdateTool, useUpdating } from '@/hooks/use-tooling';
import { plural } from '@/lib/dashboard';
import { openTerminalPath, revealInExplorer } from '@/lib/ipc';
import { ago, formatCount, measurable, sourceLabel, type ToolEntry } from '@/lib/tools';
import type { ToolKind } from '@/lib/types';
import { toast } from '@/state/toast-store';
import { type TileModel, ToolSwitch, toolDescription } from './ToolTile';

const KIND: Record<ToolEntry['kind'], string> = {
  skill: 'skill',
  plugin: 'plugin',
  command: 'command',
  mcp: 'MCP',
  agent: 'agent',
};
const PARTS = [
  ['skills', 'skill', 'skills'],
  ['commands', 'command', 'commands'],
  ['agents', 'agent', 'agents'],
  ['mcp', 'mcp', 'MCP'],
] as const;

export const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const SLIDE = [
  { opacity: 0, transform: 'translateX(32px) scale(0.98)' },
  { opacity: 1, transform: 'none' },
];
const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ToolAside({
  open,
  label,
  onGone,
  children,
}: {
  open: boolean;
  label: string;
  onGone: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const a = still() ? null : ref.current?.animate(SLIDE, { duration: 320, easing: EASE });
    return () => a?.cancel();
  }, []);
  useEffect(() => {
    if (open) return;
    const el = ref.current;
    if (!el || still()) {
      onGone();
      return;
    }
    const a = el.animate([...SLIDE].reverse(), { duration: 200, easing: EASE, fill: 'forwards' });
    a.finished.then(onGone).catch(() => {});
    return () => a.cancel();
  }, [open, onGone]);
  return (
    <aside ref={ref} className="tl-panel" aria-label={label}>
      {children}
    </aside>
  );
}

function deletePlan(e: ToolEntry, picked: string[]): string {
  if (e.copies.length) {
    const names = e.copies.filter((c) => picked.includes(c.path)).map((c) => c.project);
    const where = [...new Set(names)].join(', ');
    return e.kind === 'mcp'
      ? `Запись уберётся из настроек MCP проектов: ${where}.`
      : `Файлы уйдут в Корзину в проектах: ${where}.`;
  }
  if (e.kind === 'plugin') return `Выполнится claude plugin uninstall ${e.qualifiedName}.`;
  if (e.kind === 'mcp') return `Выполнится claude mcp remove ${e.name} -s user.`;
  if (e.npx) return `Выполнится npx skills remove ${e.name} -g.`;
  return `В Корзину: ${e.filePath ?? e.name}.`;
}

export function ToolPanel({
  m,
  now,
  onClose,
  onOpenPlugin,
  onOpenParts,
}: {
  m: TileModel;
  now: number;
  onClose: () => void;
  onOpenPlugin: (pluginKey: string) => void;
  onOpenParts: (kind: ToolKind, plugin: string) => void;
}) {
  const e = m.entry;
  const [skipped, setSkipped] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const remove = useDeleteTool();
  const update = useUpdateTool();
  const updating = useUpdating();
  const unset = useSetToolEnabled();
  const projects = [...new Map(e.copies.map((c) => [c.path, c.project])).entries()];
  const picked = projects.map(([p]) => p).filter((p) => !skipped.includes(p));
  const parts = e.plugin?.contents;
  const failOpen = (err: unknown) => toast(`Не удалось открыть: ${String(err)}`, 'fail');
  const file = e.filePath ?? e.copies[0]?.file ?? null;
  const pluginChild = e.origin === 'plugin' && e.kind !== 'plugin';

  return (
    <div className="tl-pc">
      <div className="tl-chd">
        <span className="tl-cn">
          <b>{e.name}</b>
          <ToolSwitch entry={e} />
          <button type="button" className="tl-x" aria-label="Закрыть" onClick={onClose}>
            <X className="tl-ic" strokeWidth={1.75} />
          </button>
        </span>
        <span className="tl-src">
          {KIND[e.kind]} · {sourceLabel(e)}
        </span>
        <span className="tl-cd">{toolDescription(e, m.update)}</span>
        {file && <span className="tl-path">{file}</span>}
      </div>

      <div className="tl-ct">
        {measurable(e) ? (
          <span className="tl-stats">
            <b>{m.usage ? formatCount(m.usage.count) : '…'}</b>
            <span className="tl-dim">
              {plural(m.usage?.count ?? 0, 'запуск', 'запуска', 'запусков')}
            </span>
            {m.usage?.last && <span className="tl-dim">· последний {ago(m.usage.last, now)}</span>}
          </span>
        ) : (
          <span className="tl-dim">Использование не считается</span>
        )}
      </div>

      {!!m.usage?.projects.length && (
        <div className="tl-cs">
          <span className="tl-ch">Где запускался</span>
          {m.usage.projects.slice(0, 5).map(([p, n]) => (
            <span key={p} className="tl-tp">
              <span className="tl-dim">{p}</span>
              <b>{formatCount(n)}</b>
            </span>
          ))}
          {m.usage.projects.length > 5 && (
            <span className="tl-tp tl-dim">ещё {m.usage.projects.length - 5}</span>
          )}
        </div>
      )}

      {e.kind === 'plugin' && parts && (
        <div className="tl-cs">
          <span className="tl-ch">Состав</span>
          <div className="tl-cps">
            {PARTS.filter(([k]) => parts[k] > 0).map(([k, kind, label]) => (
              <button
                key={k}
                type="button"
                className="tl-link"
                onClick={() => onOpenParts(kind, e.name)}
              >
                {parts[k]} {label}
                <ChevronRight className="tl-ic" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </div>
      )}

      {e.projectOff.length > 0 && (
        <div className="tl-cs">
          <span className="tl-ch">Выключен в проектах</span>
          {e.projectOff.map((o) => (
            <span key={o.project} className="tl-tp">
              <span className="tl-dim">{o.project}</span>
              <button
                type="button"
                className="tl-btn"
                disabled={unset.isPending}
                onClick={() => unset.mutate({ id: e.id, target: o.target, enabled: true })}
              >
                Снять
              </button>
            </span>
          ))}
        </div>
      )}

      {projects.length > 0 && (
        <div className="tl-cs">
          <span className="tl-ch">Лежит в проектах</span>
          <div className="tl-cps">
            {projects.map(([path, name]) => {
              const on = picked.includes(path);
              return (
                <button
                  key={path}
                  type="button"
                  className="tl-cb"
                  aria-pressed={on}
                  title={path}
                  onClick={() =>
                    setSkipped((s) => (on ? [...s, path] : s.filter((x) => x !== path)))
                  }
                >
                  <i>{on && <Check className="tl-ic" strokeWidth={2.25} />}</i>
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="tl-acts">
        {m.update?.url && (
          <button
            type="button"
            className="tl-btn p"
            onClick={() => m.update?.url && open(m.update.url).catch(failOpen)}
          >
            Релиз {m.update.latest}
          </button>
        )}
        {m.update && !m.update.url && (
          <button
            type="button"
            className="tl-btn p"
            disabled={updating}
            onClick={() =>
              update.mutate(e.id, {
                onSuccess: () => toast('Обновлено. Применится в новых сессиях Claude'),
                onError: (err) => toast(`Не удалось обновить: ${String(err)}`, 'fail'),
              })
            }
          >
            {update.isPending ? 'Обновляю…' : `Обновить до ${m.update.latest}`}
          </button>
        )}
        {file && (
          <button
            type="button"
            className="tl-btn tl-app"
            {...tooltip('Открыть в Zed', 'bottom')}
            aria-label="Открыть в Zed"
            onClick={() => openTerminalPath(file, null, null).catch(failOpen)}
          >
            <img src={zedIcon} alt="" draggable={false} />
          </button>
        )}
        {file && (
          <button
            type="button"
            className="tl-btn tl-app"
            {...tooltip('Показать в Проводнике', 'bottom')}
            aria-label="Показать в Проводнике"
            onClick={() => revealInExplorer(file).catch(failOpen)}
          >
            <img src={explorerIcon} alt="" draggable={false} />
          </button>
        )}
        {pluginChild ? (
          <button
            type="button"
            className="tl-link"
            onClick={() => e.pluginKey && onOpenPlugin(e.pluginKey)}
          >
            Часть plugin {e.qualifiedName.split(':')[0]}
            <ChevronRight className="tl-ic" strokeWidth={1.75} />
          </button>
        ) : (
          <button
            type="button"
            className="tl-btn danger"
            disabled={e.copies.length > 0 && picked.length === 0}
            onClick={() => setConfirm(true)}
          >
            {e.copies.length ? `Удалить в ${picked.length}` : 'Удалить'}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        danger
        title={`Удалить ${e.name}?`}
        description={deletePlan(e, picked)}
        confirmLabel="Удалить"
        onConfirm={() => {
          remove.mutate({
            id: e.id,
            projects: picked,
            done:
              (e.kind === 'skill' || e.kind === 'command' || e.kind === 'agent') && !e.npx
                ? 'Удалено в Корзину'
                : 'Удалено',
          });
          setConfirm(false);
          onClose();
        }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
