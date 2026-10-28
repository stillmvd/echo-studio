import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Check, Search } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { EASE, ToolAside, ToolPanel } from '@/components/tools/ToolPanel';
import { type TileModel, ToolTile } from '@/components/tools/ToolTile';
import {
  useToolRuns,
  useTools,
  useToolUpdates,
  useUpdateTool,
  useUpdating,
} from '@/hooks/use-tooling';
import { cn } from '@/lib/cn';
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
  const runs = useToolRuns();
  const check = useToolUpdates();
  const update = useUpdateTool();
  const updating = useUpdating();
  const [failed, setFailed] = useState<string[]>([]);
  const [tiles] = useAutoAnimate<HTMLDivElement>({ duration: 280, easing: EASE });
  const [panelId, setPanelId] = useState(selectedId);
  if (selectedId && selectedId !== panelId) setPanelId(selectedId);
  const gone = useCallback(() => setPanelId(null), []);
  const lastPanel = useRef<TileModel>(undefined);
  const now = Date.now();
  const start = runs.data?.start ?? null;
  const checkErrors = check.error ? [String(check.error)] : (check.data?.errors ?? []);

  const updates = new Map(check.data?.updates.map((u) => [u.id, u]));
  const models = (tools.data ?? []).map(
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

  const updateAll = async () => {
    const list = shown.filter((m) => m.update);
    const errors: string[] = [];
    for (const m of list) {
      try {
        await update.mutateAsync(m.entry.id);
      } catch (e) {
        errors.push(`${m.entry.name}: ${String(e)}`);
      }
    }
    setFailed(errors);
    toast(
      `Обновлено ${list.length - errors.length}, ошибок ${errors.length}`,
      errors.length ? 'fail' : 'done',
    );
  };

  return (
    <div className={cn('tl-root', panel && 'has-panel')}>
      <section className="tl-body">
        <div className="tl-top">
          <div className="tl-tabs" role="tablist" aria-label="Инструменты">
            {KINDS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={k === kind}
                className="tl-tab"
                onClick={() => setKind(k)}
              >
                {label}
                <i>{models.filter((m) => m.entry.kind === k).length}</i>
              </button>
            ))}
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
                onClick={() => void check.refetch()}
              >
                <Check className="tl-ic" strokeWidth={2.25} />
                Проверено в {time(check.dataUpdatedAt)}
              </button>
            ) : (
              <button
                type="button"
                className="tl-btn"
                disabled={check.isFetching}
                onClick={() => void check.refetch()}
              >
                {check.isFetching ? 'Проверяю…' : 'Проверить обновления'}
              </button>
            )}
          </div>
        </div>

        <div className="tl-top2">
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
                  title={f === 'stale' && shortHistory ? 'Мало истории: меньше 30 дней' : undefined}
                  onClick={() => setFilter(f)}
                >
                  {label}
                  {!off && <i>{n}</i>}
                </button>
              );
            })}
          </fieldset>
          <span className="tl-sp" />
          {failed.length > 0 && (
            <details className="tl-fails">
              <summary>Ошибок обновления: {failed.length}</summary>
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
          {filter === 'upd' && shown.some((m) => m.update) && (
            <button
              type="button"
              className="tl-btn p"
              disabled={updating}
              onClick={() => void updateAll()}
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
            <div className="tl-tiles" key={kind} ref={tiles}>
              {shown.map((m) => (
                <ToolTile
                  key={m.entry.id}
                  m={m}
                  max={max}
                  now={now}
                  selected={m.entry.id === selectedId}
                  onOpen={() => select(m.entry.id === selectedId ? null : m.entry.id)}
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
            start={start}
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
    </div>
  );
}
