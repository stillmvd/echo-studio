import { open } from '@tauri-apps/plugin-shell';
import { Copy, FolderOpen } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Popover } from '@/components/ui/Popover';
import { focusSessionWindow, revealInExplorer } from '@/lib/ipc';
import type { ClaudeSession } from '@/lib/types';
import { externalAction } from '@/lib/workbench';
import { useStartSession } from './useStartSession';

interface Shown {
  session: ClaudeSession;
  anchor: HTMLElement;
  error: string | null;
}

export function useExternalSession() {
  const { start, dialogs } = useStartSession();
  const [shown, setShown] = useState<Shown | null>(null);
  const [isOpen, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const show = (session: ClaudeSession, anchor: HTMLElement, error: string | null = null) => {
    setShown({ session, anchor, error });
    setCopied(false);
    setOpen(true);
  };

  const openExternal = async (s: ClaudeSession, anchor: HTMLElement) => {
    if (isOpen && shown?.anchor === anchor) {
      close();
      return;
    }
    const action = externalAction(s);
    if (action === 'resume' && s.projectPath) {
      await start(s.projectPath, s.sessionId);
      return;
    }
    if (action === 'none') {
      if (s.kind === 'external') show(s, anchor);
      return;
    }
    if (s.pid === null) {
      show(s, anchor);
      return;
    }
    try {
      const r = await focusSessionWindow(s.pid, s.sessionId);
      if (r === 'vscode') {
        await open(
          `vscode://stillmvd.claude-session-focus/focus?session=${encodeURIComponent(s.sessionId)}`,
        );
      } else if (r === 'not-found') {
        show(s, anchor);
      }
    } catch (e) {
      show(s, anchor, String(e));
    }
  };

  const s = shown?.session;
  const folder = s?.projectPath ?? s?.cwd ?? null;
  const exited = s?.status === 'exited';
  const layer = (
    <>
      {dialogs}
      <Popover
        anchor={shown?.anchor ?? null}
        open={isOpen}
        onClose={close}
        label="Сессия вне Echo"
        className="wb-pop"
      >
        <b>{exited ? 'Сессия завершена вне Echo' : 'Сессия открыта в терминале вне Echo'}</b>
        <p>
          {exited
            ? 'Папка не из списка проектов — продолжить её в Echo нельзя.'
            : 'Окно не нашлось — возможно, вкладка терминала закрыта, а процесс ещё жив.'}
        </p>
        {shown?.error && <p className="wb-pop-err">{shown.error}</p>}
        <div className="wb-pop-b">
          <button
            type="button"
            className="wb-btn sm"
            onClick={() => {
              if (!s) return;
              void navigator.clipboard
                .writeText(s.sessionId)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
          >
            <Copy strokeWidth={2} />
            <span className="wb-swap">
              <span hidden={copied}>Копировать id</span>
              <span hidden={!copied}>Скопировано</span>
            </span>
          </button>
          {folder && (
            <button
              type="button"
              className="wb-btn sm"
              onClick={() => {
                close();
                void revealInExplorer(folder).catch(() => {});
              }}
            >
              <FolderOpen strokeWidth={2} />
              Открыть папку
            </button>
          )}
        </div>
      </Popover>
    </>
  );

  return { openExternal, layer };
}
