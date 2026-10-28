import { useSetToolEnabled } from '@/hooks/use-tooling';
import { cn } from '@/lib/cn';
import {
  ago,
  formatCount,
  measurable,
  pluginParts,
  sourceLabel,
  type ToolEntry,
  type ToolUpdate,
  type ToolUsage,
} from '@/lib/tools';

export interface TileModel {
  entry: ToolEntry;
  usage: ToolUsage | undefined;
  counting: boolean;
  stale: boolean;
  update: ToolUpdate | undefined;
}

export function ToolSwitch({ entry }: { entry: ToolEntry }) {
  const toggle = useSetToolEnabled();
  const can = entry.toggle !== null && (entry.state === 'enabled' || entry.state === 'disabled');
  if (!can || !entry.toggle) return null;
  const on = entry.state === 'enabled';
  const target = entry.toggle;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? `Выключить ${entry.name}` : `Включить ${entry.name}`}
      className="tl-sw"
      disabled={toggle.isPending}
      onClick={() => toggle.mutate({ id: entry.id, target, enabled: !on })}
    >
      <i />
    </button>
  );
}

export function toolDescription(entry: ToolEntry, update: ToolUpdate | undefined) {
  if (entry.kind === 'plugin') {
    const v = entry.plugin?.version ?? '';
    return (
      <>
        {update ? (
          <>
            {update.current} → <b>{update.latest}</b>
          </>
        ) : (
          v
        )}
        {v || update ? ' · ' : ''}
        {pluginParts(entry)}
      </>
    );
  }
  return entry.description ?? 'без описания';
}

export function Runs({ m, max, now }: { m: TileModel; max: number; now: number }) {
  if (!measurable(m.entry)) return <span className="tl-dim">не считается</span>;
  if (!m.usage)
    return m.counting ? <span className="tl-shim" /> : <span className="tl-dim">—</span>;
  if (!m.usage.count) return <span className="tl-dim">{ago(null, now)}</span>;
  const width = Math.max(4, (Math.log1p(m.usage.count) / Math.log1p(Math.max(max, 1))) * 100);
  return (
    <>
      <span className="tl-bar" title={`последний ${ago(m.usage.last, now)}`}>
        <i style={{ width: `${width}%` }} />
      </span>
      <b>{formatCount(m.usage.count)}</b>
    </>
  );
}

export function ToolTile({
  m,
  max,
  now,
  selected,
  onOpen,
}: {
  m: TileModel;
  max: number;
  now: number;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <div className={cn('tl-tile', selected && 'sel')}>
      <button
        type="button"
        className="tl-open"
        aria-label={`${m.entry.name}, ${sourceLabel(m.entry)}`}
        aria-pressed={selected}
        onClick={onOpen}
      />
      <span className="tl-l1">
        <b>{m.entry.name}</b>
        <ToolSwitch entry={m.entry} />
      </span>
      <span className="tl-src">{sourceLabel(m.entry)}</span>
      <span className="tl-desc">{toolDescription(m.entry, m.update)}</span>
      <span className="tl-l3">
        <span className="tl-use">
          <Runs m={m} max={max} now={now} />
        </span>
        {m.stale && <span className="tl-chip">заброшен</span>}
        {m.update && <span className="tl-chip acc">обновление</span>}
      </span>
    </div>
  );
}
