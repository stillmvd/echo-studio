import type { CSSProperties } from 'react';
import { type AppTab, goToTab, useUiStore } from '@/state/ui-store';
import { glassIcon, glassTone } from './glass-icons';

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
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={() => goToTab(id)}
      className="nr-btn"
      style={{ '--tn': glassTone[id] } as CSSProperties}
    >
      <span className="nr-gi">{glassIcon[id]}</span>
    </button>
  );
}

export function NavRail() {
  return (
    <nav aria-label="Разделы" className="flex w-14 shrink-0 flex-col items-center gap-2 pb-3">
      {sections.map((s) => (
        <RailButton key={s.id} {...s} />
      ))}
      <div className="mt-auto">
        <RailButton id="settings" label="Настройки" />
      </div>
    </nav>
  );
}
