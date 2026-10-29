import { tooltip } from '@/components/ui/Tooltip';
import { useToolUpdates } from '@/hooks/use-tooling';
import { type AppTab, goToTab, useUiStore } from '@/state/ui-store';
import { NavIcon } from './nav-icons';

const sections: { id: AppTab; label: string }[] = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'workbench', label: 'Рабочее место' },
  { id: 'tools', label: 'Инструменты' },
  { id: 'memory', label: 'Память' },
  { id: 'conversations', label: 'Сессии' },
];

function RailButton({ id, label, dot }: { id: AppTab; label: string; dot?: string }) {
  const active = useUiStore((s) => s.activeTab === id);

  return (
    <button
      type="button"
      {...tooltip(dot ? `${label} · ${dot}` : label)}
      aria-label={dot ? `${label}, ${dot}` : label}
      aria-current={active ? 'page' : undefined}
      onClick={() => goToTab(id)}
      className="nr-btn"
    >
      <NavIcon tab={id} />
      {dot && <i className="nr-dot" />}
    </button>
  );
}

function ToolsButton({ label }: { label: string }) {
  const n = useToolUpdates().data?.updates.length ?? 0;
  return <RailButton id="tools" label={label} dot={n ? `обновлений: ${n}` : undefined} />;
}

export function NavRail() {
  return (
    <nav aria-label="Разделы" className="flex w-[62px] shrink-0 flex-col items-center gap-2 pb-3">
      {sections.map((s) =>
        s.id === 'tools' ? (
          <ToolsButton key={s.id} label={s.label} />
        ) : (
          <RailButton key={s.id} {...s} />
        ),
      )}
      <div className="mt-auto">
        <RailButton id="settings" label="Настройки" />
      </div>
    </nav>
  );
}
