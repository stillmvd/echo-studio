import { Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { connect, fitTerm, focus, mount, reattach, unmount, useClaudeTerm } from './terminals';

interface Props {
  sessionKey: string;
  shortId: string | null;
  live: boolean;
  visible: boolean;
  focused: boolean;
  accent?: boolean;
  onResume: () => void;
}

export function ClaudeTerminal({
  sessionKey,
  shortId,
  live,
  visible,
  focused,
  accent,
  onResume,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const entry = useClaudeTerm(sessionKey);
  const { state } = entry;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    mount(entry, el);
    const ro = new ResizeObserver(() => fitTerm(entry));
    ro.observe(el);
    return () => {
      ro.disconnect();
      unmount(entry);
    };
  }, [entry]);

  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      fitTerm(entry);
      if (focused) focus(sessionKey);
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, focused, entry, sessionKey]);

  useEffect(() => {
    if (!shortId || !live) return;
    if (state === 'idle' || (state === 'ended' && Date.now() - entry.attachedAt > 3000)) {
      connect(sessionKey, shortId);
    }
  }, [shortId, live, state, entry, sessionKey]);

  return (
    <div className={cn('wb-tw', accent && 'on')} hidden={!visible}>
      <div ref={ref} className="wb-term" />
      {!live && state !== 'live' && state !== 'attaching' && (
        <div className="wb-term-note">
          <span>Сессия завершена</span>
          <button type="button" className="wb-btn p" onClick={onResume}>
            <Play strokeWidth={2} />
            Продолжить
          </button>
        </div>
      )}
      {live && (state === 'ended' || state === 'error') && shortId && (
        <div className="wb-term-note">
          <span>{state === 'error' ? (entry.error ?? 'Ошибка подключения') : 'Отсоединено'}</span>
          <button type="button" className="wb-btn" onClick={() => reattach(sessionKey, shortId)}>
            <RotateCcw strokeWidth={2} />
            Подключить
          </button>
        </div>
      )}
    </div>
  );
}
