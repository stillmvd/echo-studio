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
      title={
        auto
          ? 'Пульт включён: сессии, которые ждут ответа или работают, сами встают в свободные ячейки, закреплённые остаются на месте'
          : 'Пульт выключен: ячейки не меняются сами'
      }
      onClick={() => setAuto(!auto)}
    >
      <Zap strokeWidth={2.25} fill={auto ? 'currentColor' : 'none'} />
      <span className="wb-btn-l">Пульт</span>
    </button>
  );
}
