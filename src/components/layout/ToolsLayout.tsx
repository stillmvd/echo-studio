import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Check, Search, X } from 'lucide-react';
import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { EASE, ToolAside, ToolPanel } from '@/components/tools/ToolPanel';
import { type TileModel, ToolTile } from '@/components/tools/ToolTile';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  dropDeleted,
  useCheckProgress,
  useDeleteTool,
  useDeleting,
  useSetToolEnabled,
  useToolRuns,
  useTools,
  useToolUpdates,
  useUpdateTool,
  useUpdating,
} from '@/hooks/use-tooling';
import { cn } from '@/lib/cn';
import { plural } from '@/lib/dashboard';
import { historyDays, isStale, KINDS, STALE_DAYS, shortDate, type ToolsFilter } from '@/lib/tools';
import { toast } from '@/state/toast-store';
import { useUiStore } from '@/state/ui-store';

const FILTERS: [ToolsFilter, string][] = [
  ['all', 'Все'],
  ['stale', 'Заброшенные'],
  ['off', 'Выключенные'],
  ['upd', 'Есть обновление'],
];
const EMPTY: Record<ToolsFilter, string> = {
  all: 'Ничего не найдено',
  stale: 'Заброшенных нет',
  off: 'Ничего не выключено',
  upd: 'Обновлений нет',
};

const time = (t: number) =>
  new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

const switchable = (m: TileModel, on: boolean) =>
  !!m.entry.toggle && m.entry.state === (on ? 'disabled' : 'enabled');
const pluginPart = (m: TileModel) => m.entry.origin === 'plugin' && m.entry.kind !== 'plugin';
const names = (list: TileModel[]) =>
  list.length > 8
    ? `${list
        .slice(0, 8)
        .map((m) => m.entry.name)
        .join(', ')} и ещё ${list.length - 8}`
    : list.map((m) => m.entry.name).join(', ');

export function ToolsLayout() {
  const kind = useUiStore((s) => s.toolsType);
  const setKind = useUiStore((s) => s.setToolsType);
  const filter = useUiStore((s) => s.toolsFilter);
  const setFilter = useUiStore((s) => s.setToolsFilter);
  const query = useUiStore((s) => s.toolsQuery);
  const setQuery = useUiStore((s) => s.setToolsQuery);
  const selectedId = useUiStore((s) => s.selectedToolId);
  const select = useUiStore((s) => s.setSelectedToolId);

  const tools = useTools();
  const deleting = useDeleting();
  const runs = useToolRuns();
  const check = useToolUpdates();
  const update = useUpdateTool();
  const updating = useUpdating();
  const progress = useCheckProgress(check.isFetching);
  const toggle = useSetToolEnabled();
  const remove = useDeleteTool();
  const [failed, setFailed] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [tiles] = useAutoAnimate<HTMLDivElement>({ duration: 280, easing: EASE });
  const [panelId, setPanelId] = useState(selectedId);
  if (selectedId && selectedId !== panelId) setPanelId(selectedId);
  const gone = useCallback(() => setPanelId(null), []);
  const lastPanel = useRef<TileModel>(undefined);
  const now = Date.now();
  const start = runs.data?.start ?? null;
  const checkErrors = check.error ? [String(check.error)] : (check.data?.errors ?? []);

  const updates = new Map(check.data?.updates.map((u) => [u.id, u]));
  const runCheck = async () => {
    const r = await check.refetch();
    if (r.error) return toast(`Не удалось проверить: ${String(r.error)}`, 'fail');
    const found = (tools.data ?? []).filter((e) => r.data?.updates.some((u) => u.id === e.id));
    const per = KINDS.map(
      ([k, label]) => [label, found.filter((e) => e.kind === k).length] as const,
    )
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${label} ${n}`);
    toast(
      found.length
        ? `Есть обновления: ${per.join(', ')}`
        : r.data?.errors.length
          ? `Обновлений не найдено, не проверено: ${r.data.errors.length}`
          : 'Обновлений нет',
      r.data?.errors.length ? 'fail' : 'done',
    );
  };
  const models = deleting.reduce(dropDeleted, tools.data ?? []).map(
    (entry): TileModel => ({
      entry,
      usage: runs.data?.usage[entry.id],
      counting: runs.isPending,
      stale: !!runs.data && isStale(entry, runs.data.usage[entry.id], start, now),
      update: updates.get(entry.id),
    }),
  );

  const ofKind = models.filter((m) => m.entry.kind === kind);
  const pass: Record<ToolsFilter, (m: TileModel) => boolean> = {
    all: () => true,
    stale: (m) => m.stale,
    off: (m) => m.entry.state === 'disabled' || m.entry.projectOff.length > 0,
    upd: (m) => !!m.update,
  };
  const q = query.trim().toLowerCase();
  const shown = ofKind
    .filter(pass[filter])
    .filter(
      (m) =>
        !q ||
        m.entry.qualifiedName.toLowerCase().includes(q) ||
        (m.entry.description?.toLowerCase().includes(q) ?? false),
    )
    .sort(
      (a, b) =>
        (b.usage?.count ?? 0) - (a.usage?.count ?? 0) || a.entry.name.localeCompare(b.entry.name),
    );
  const max = Math.max(0, ...ofKind.map((m) => m.usage?.count ?? 0));
  const selected = models.find((m) => m.entry.id === selectedId);
  const found = models.find((m) => m.entry.id === panelId);
  if (found) lastPanel.current = found;
  const panel = panelId ? (found ?? lastPanel.current) : undefined;
  const shortHistory = !!runs.data && historyDays(start, now) < STALE_DAYS;

  const ids = shown.map((m) => m.entry.id);
  const chosen = shown.filter((m) => picked.includes(m.entry.id));
  const toOn = chosen.filter((m) => switchable(m, true));
  const toOff = chosen.filter((m) => switchable(m, false));
  const toUpd = chosen.filter((m) => m.update && !m.update.url);
  const toDel = chosen.filter((m) => !pluginPart(m));
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmDel) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'Escape') setPicked([]);
      if (e.key.toLowerCase() === 'a' && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        setPicked(idsRef.current);
        select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmDel, select]);

  const onTile = (id: string, e: MouseEvent) => {
    const base = picked.length ? picked : selectedId ? [selectedId] : [];
    if (e.shiftKey) {
      const from = ids.indexOf(anchor ?? selectedId ?? id);
      const to = ids.indexOf(id);
      const range = from < 0 ? [id] : ids.slice(Math.min(from, to), Math.max(from, to) + 1);
      if (from < 0) setAnchor(id);
      setPicked(e.ctrlKey || e.metaKey ? [...new Set([...base, ...range])] : range);
    } else if (e.ctrlKey || e.metaKey) {
      setPicked(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
      setAnchor(id);
    } else {
      setPicked([]);
      setAnchor(id);
      select(id === selectedId ? null : id);
      return;
    }
    select(null);
  };

  const run = async (list: TileModel[], act: (m: TileModel) => Promise<unknown>, done: string) => {
    setBulk(true);
    const errors: string[] = [];
    for (const m of list) {
      try {
        await act(m);
      } catch (e) {
        errors.push(`${m.entry.name}: ${String(e)}`);
      }
    }
    setBulk(false);
    setFailed(errors);
    toast(
      errors.length
        ? `${done} ${list.length - errors.length}, ошибок ${errors.length}`
        : `${done} ${list.length}`,
      errors.length ? 'fail' : 'done',
    );
  };
  const setOn = (list: TileModel[], enabled: boolean) =>
    run(
      list,
      (m) =>
        m.entry.toggle
          ? toggle.mutateAsync({ id: m.entry.id, target: m.entry.toggle, enabled })
          : Promise.resolve(),
      enabled ? 'Включено' : 'Выключено',
    );
  const updateMany = (list: TileModel[]) =>
    run(list, (m) => update.mutateAsync(m.entry.id), 'Обновлено');
  const deleteMany = async () => {
    const list = toDel;
    setConfirmDel(false);
    setPicked([]);
    await run(
      list,
      (m) =>
        remove.mutateAsync({
          id: m.entry.id,
          projects: [...new Set(m.entry.copies.map((c) => c.path))],
          done: '',
        }),
      'Удалено',
    );
  };
  const busy = bulk || updating;
  const pct = progress?.total ? progress.done / progress.total : 0;

  return (
    <div className={cn('tl-root', panel && 'has-panel')}>
      <section className="tl-body">
        <div className="tl-top">
          <div className="tl-tabs" role="tablist" aria-label="Инструменты">
            {KINDS.map(([k, label]) => {
              const upd = models.filter((m) => m.entry.kind === k && m.update).length;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={k === kind}
                  className="tl-tab"
                  onClick={() => {
                    setKind(k);
                    setPicked([]);
                  }}
                >
                  {label}
                  <i>{models.filter((m) => m.entry.kind === k).length}</i>
                  {upd > 0 && (
                    <em className="tl-tab-upd" title={`Обновлений: ${upd}`}>
                      ↑{upd}
                    </em>
                  )}
                </button>
              );
            })}
          </div>
          <div className="tl-tools">
            <label className="tl-search">
              <Search className="tl-ic" strokeWidth={1.75} />
              <input
                value={query}
                placeholder="Поиск"
                aria-label="Поиск инструментов"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              />
            </label>
            {checkErrors.length > 0 && !check.isFetching && (
              <span className="tl-dim tl-err" title={checkErrors.join('\n')}>
                Не удалось проверить: {checkErrors.join('; ')}
              </span>
            )}
            {check.data && !check.isFetching ? (
              <button
                type="button"
                className="tl-dim tl-chk"
                title="Проверить снова"
                onClick={() => void runCheck()}
              >
                <Check className="tl-ic" strokeWidth={2.25} />
                Проверено в {time(check.dataUpdatedAt)}
              </button>
            ) : (
              <button
                type="button"
                className="tl-btn tl-prog"
                style={{ '--p': pct } as CSSProperties}
                disabled={check.isFetching}
                onClick={() => void runCheck()}
              >
                {!check.isFetching
                  ? 'Проверить обновления'
                  : progress
                    ? `Проверено ${progress.done} из ${progress.total}`
                    : 'Проверяю…'}
              </button>
            )}
          </div>
        </div>

        <div className="tl-top2">
          {chosen.length > 0 ? (
            <div className="tl-pick">
              <span className="tl-pick-n">
                Выбрано {chosen.length}
                <button type="button" aria-label="Снять выбор" onClick={() => setPicked([])}>
                  <X className="tl-ic" strokeWidth={2} />
                </button>
              </span>
              {toOn.length > 0 && (
                <button
                  type="button"
                  className="tl-btn"
                  disabled={busy}
                  onClick={() => void setOn(toOn, true)}
                >
                  Включить {toOn.length}
                </button>
              )}
              {toOff.length > 0 && (
                <button
                  type="button"
                  className="tl-btn"
                  disabled={busy}
                  onClick={() => void setOn(toOff, false)}
                >
                  Выключить {toOff.length}
                </button>
              )}
              {toUpd.length > 0 && (
                <button
                  type="button"
                  className="tl-btn p"
                  disabled={busy}
                  onClick={() => void updateMany(toUpd)}
                >
                  Обновить {toUpd.length}
                </button>
              )}
              {toDel.length > 0 && (
                <button
                  type="button"
                  className="tl-btn danger"
                  disabled={busy}
                  onClick={() => setConfirmDel(true)}
                >
                  Удалить {toDel.length}
                </button>
              )}
            </div>
          ) : (
            <fieldset className="tl-fcs" aria-label="Фильтр">
              {FILTERS.map(([f, label]) => {
                const n = ofKind.filter(pass[f]).length;
                const off = (f === 'upd' && !check.data) || (f === 'stale' && shortHistory);
                return (
                  <button
                    key={f}
                    type="button"
                    className="tl-fc"
                    aria-pressed={f === filter}
                    disabled={off}
                    title={
                      f === 'stale' && shortHistory ? 'Мало истории: меньше 30 дней' : undefined
                    }
                    onClick={() => setFilter(f)}
                  >
                    {label}
                    {!off && <i>{n}</i>}
                  </button>
                );
              })}
            </fieldset>
          )}
          <span className="tl-sp" />
          {failed.length > 0 && (
            <details className="tl-fails">
              <summary>Ошибок: {failed.length}</summary>
              {failed.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </details>
          )}
          {runs.isError ? (
            <span className="tl-dim">Не удалось посчитать запуски: {String(runs.error)}</span>
          ) : (
            start !== null && <span className="tl-dim">История с {shortDate(start)}</span>
          )}
          {filter === 'upd' && !chosen.length && shown.some((m) => m.update && !m.update.url) && (
            <button
              type="button"
              className="tl-btn p"
              disabled={busy}
              onClick={() => void updateMany(shown.filter((m) => m.update && !m.update.url))}
            >
              {updating ? 'Обновляю…' : 'Обновить всё'}
            </button>
          )}
        </div>

        <div className="tl-list">
          {tools.isError ? (
            <div className="tl-empty">Не удалось прочитать инструменты: {String(tools.error)}</div>
          ) : tools.isPending ? null : shown.length === 0 ? (
            <div className="tl-empty">{EMPTY[filter]}</div>
          ) : (
            <div className={cn('tl-tiles', chosen.length > 0 && 'picking')} key={kind} ref={tiles}>
              {shown.map((m) => (
                <ToolTile
                  key={m.entry.id}
                  m={m}
                  max={max}
                  now={now}
                  selected={m.entry.id === selectedId}
                  picked={picked.includes(m.entry.id)}
                  onOpen={(e) => onTile(m.entry.id, e)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {panel && (
        <ToolAside
          open={!!selected && selectedId === panelId}
          label={panel.entry.name}
          onGone={gone}
        >
          <ToolPanel
            key={panel.entry.id}
            m={panel}
            now={now}
            onClose={() => select(null)}
            onOpenPlugin={(key) => {
              setKind('plugin');
              setFilter('all');
              select(`plugin:plugin:${key}`);
            }}
            onOpenParts={(k, plugin) => {
              setKind(k);
              setFilter('all');
              setQuery(`${plugin}:`);
              select(null);
            }}
          />
        </ToolAside>
      )}

      <ConfirmDialog
        open={confirmDel}
        danger
        title={`Удалить ${toDel.length} ${plural(toDel.length, 'инструмент', 'инструмента', 'инструментов')}?`}
        description={[
          `${names(toDel)}.`,
          'Файлы уйдут в Корзину, plugins и MCP удалятся через claude, копии в проектах — во всех проектах.',
          chosen.length > toDel.length
            ? `Части plugins не удаляются: ${chosen.length - toDel.length}.`
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        confirmLabel="Удалить"
        onConfirm={() => void deleteMany()}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  );
}
