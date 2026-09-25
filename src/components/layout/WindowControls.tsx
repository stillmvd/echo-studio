import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

const appWindow = getCurrentWindow();

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    const pending = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);

  const btn =
    'grid h-8 w-8 place-items-center rounded-full text-[var(--color-text-muted)] transition-colors duration-200 ease-[var(--ease-trail)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-offset-[-2px] motion-reduce:transition-none';

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Minimize"
        onClick={() => appWindow.minimize()}
        className={btn}
      >
        <Minus className="h-4 w-4" strokeWidth={1.25} />
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => appWindow.toggleMaximize()}
        className={btn}
      >
        {maximized ? (
          <Copy className="h-3.5 w-3.5" strokeWidth={1.25} />
        ) : (
          <Square className="h-3.5 w-3.5" strokeWidth={1.25} />
        )}
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={() => appWindow.close()}
        className={cn(btn, 'hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]')}
      >
        <X className="h-4 w-4" strokeWidth={1.25} />
      </button>
    </div>
  );
}
