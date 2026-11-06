import { Zap } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useWorkbenchStore } from '@/state/workbench-store';

export function ModeSwitch() {
  const auto = useWorkbenchStore((s) => s.auto);
  const setAuto = useWorkbenchStore((s) => s.setAuto);
  return (
    <button
      type="button"
      className={cn('wb-btn wl-auto', auto && 'on')}
      aria-pressed={auto}
      data-tip={
        auto
          ? 'Вернуться к проекту'
          : 'Сессии всех проектов в одной сетке — ждущие ответа встают сами'
      }
      onClick={() => setAuto(!auto)}
    >
      <Zap strokeWidth={2.25} fill={auto ? 'currentColor' : 'none'} />
      <span className="wb-btn-l">Пульт</span>
    </button>
  );
}
