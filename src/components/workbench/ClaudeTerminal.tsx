import { Play, RotateCcw, Square } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

import { STATUS_LABEL, type StatusView, statusTitle } from '@/lib/workbench';
import {
  connect,
  fitTerm,
  focus,
  mount,
  reattach,
  unmount,
  useClaudeTerm,
  useShown,
} from './terminals';

interface Props {
  sessionKey: string;
  shortId: string | null;
  live: boolean;
  status: StatusView;
  visible: boolean;
  focused: boolean;
  accent?: boolean;
  onResume: () => void;
  onStop: () => void;
}

export function ClaudeTerminal({
  sessionKey,
  shortId,
  live,
  status,
  visible,
  focused,
  accent,
  onResume,
  onStop,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const entry = useClaudeTerm(sessionKey);
  const { state } = entry;
  useShown(sessionKey, visible);

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
    const respawned = (state === 'detached' || state === 'ended') && shortId !== entry.shortId;
    if (
      state === 'idle' ||
      respawned ||
      (state === 'ended' && Date.now() - entry.attachedAt > 3000)
    ) {
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
      {live && state === 'detached' && shortId && (
        <div className="wb-term-note dt" role="status">
          <span>
            Отключено от сессии
            <span className="wb-dim" title={statusTitle(status)}>
              {' '}
              · {STATUS_LABEL[status]}
            </span>
          </span>
          <button
            type="button"
            className="wb-btn p"
            onClick={() => {
              reattach(sessionKey, shortId);
              focus(sessionKey);
            }}
          >
            <RotateCcw strokeWidth={2} />
            Вернуться
          </button>
          <button type="button" className="wb-btn wb-stop" onClick={onStop}>
            <Square fill="currentColor" strokeWidth={2} />
            Завершить сессию
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
