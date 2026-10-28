import { tooltip } from '@/components/ui/Tooltip';
import { type AppTab, goToTab, useUiStore } from '@/state/ui-store';
import { NavIcon } from './nav-icons';

const sections: { id: AppTab; label: string }[] = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'workbench', label: 'Рабочее место' },
  { id: 'tools', label: 'Инструменты' },
  { id: 'memory', label: 'Память' },
  { id: 'conversations', label: 'Сессии' },
];

function RailButton({ id, label }: { id: AppTab; label: string }) {
  const active = useUiStore((s) => s.activeTab === id);

  return (
    <button
      type="button"
      {...tooltip(label)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={() => goToTab(id)}
      className="nr-btn"
    >
      <NavIcon tab={id} />
    </button>
  );
}

export function NavRail() {
  return (
    <nav aria-label="Разделы" className="flex w-[62px] shrink-0 flex-col items-center gap-2 pb-3">
      {sections.map((s) => (
        <RailButton key={s.id} {...s} />
      ))}
      <div className="mt-auto">
        <RailButton id="settings" label="Настройки" />
      </div>
    </nav>
  );
}
