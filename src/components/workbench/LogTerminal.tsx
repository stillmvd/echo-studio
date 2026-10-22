import { CornerDownRight, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import type { DevServer } from '@/lib/types';
import { devHealth, errorsLabel } from '@/lib/workbench';
import { fitTerm, logEntry, mount, revealText, startTail, unmount, useShown } from './terminals';

interface Props {
  tabKey: string;
  projectPath: string;
  visible: boolean;
  server: DevServer | undefined;
  onRestart: () => void;
}

export function LogTerminal({ tabKey, projectPath, visible, server, onRestart }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const entry = logEntry(tabKey);
  useShown(tabKey, visible);

  useEffect(() => {
    if (visible) startTail(tabKey, projectPath);
  }, [visible, tabKey, projectPath]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    mount(entry, el);
    const ro = new ResizeObserver(() => fitTerm(entry));
    ro.observe(el);
    return () => {
      ro.disconnect();
      unmount(entry, el);
    };
  }, [entry]);

  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => fitTerm(entry));
    return () => cancelAnimationFrame(raf);
  }, [visible, entry]);

  const health = devHealth(server);
  const at = server?.errors?.at ?? null;

  return (
    <div className="wb-tw" hidden={!visible}>
      {server && (health === 'crashed' || health === 'errors') && (
        <div className={cn('wb-devbar', health === 'errors' && 'warn')} role="status">
          <span>
            {health === 'crashed' ? (
              `Dev ${server.restarted ? 'упал снова' : 'упал'} (код ${server.exitCode ?? '?'})`
            ) : (
              <>
                {errorsLabel(server.errors?.count ?? 1)} сборки
                {at && <span className="wb-dim"> · {at}</span>}
              </>
            )}
          </span>
          {health === 'errors' && at && (
            <button
              type="button"
              className="wb-btn"
              title="К ошибке"
              onClick={() => revealText(tabKey, at)}
            >
              <CornerDownRight strokeWidth={2} />
              <span className="wb-devbar-l">К ошибке</span>
            </button>
          )}
          <button type="button" className="wb-btn p" title="Перезапустить" onClick={onRestart}>
            <RotateCcw strokeWidth={2} />
            <span className="wb-devbar-l">Перезапустить</span>
          </button>
        </div>
      )}
      <div ref={ref} className="wb-term" />
    </div>
  );
}
