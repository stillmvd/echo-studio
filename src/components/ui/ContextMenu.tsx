import { ChevronRight } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { menuPlacement, menuPoint, type Placement, submenuPlacement } from '@/lib/context-menu';

export interface ContextMenuAction {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  onSelect: () => void;
}

export interface ContextSubmenu {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  items: MenuItem[];
}

export type MenuItem = ContextMenuAction | ContextSubmenu | 'separator';
export type ContextMenuItem = MenuItem;

const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const ENTER_MS = 200;
const EXIT_MS = 150;

const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function frames(el: HTMLElement): Keyframe[] {
  const dy = el.dataset.up === 'true' ? 4 : -4;
  return [
    { opacity: 0, transform: `translateY(${dy}px) scale(.96)` },
    { opacity: 1, transform: 'none' },
  ];
}

function keyOf(item: MenuItem | undefined): string {
  return item === undefined || item === 'separator' ? 'start' : item.label;
}

function enabledItems(menu: HTMLElement | null): HTMLButtonElement[] {
  return [
    ...(menu?.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"]:not(:disabled)') ??
      []),
  ];
}

interface Shared {
  panels: Set<HTMLElement>;
  closing: boolean;
  select: (item: ContextMenuAction) => void;
}

interface PanelProps {
  items: MenuItem[];
  place: (w: number, h: number) => Placement;
  shared: Shared;
  focusFirst: boolean;
  onBack?: () => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}

function Panel({ items, place, shared, focusFirst, onBack, panelRef }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const placeRef = useRef(place);
  const focusRef = useRef(focusFirst);
  const [sub, setSub] = useState<{ index: number; focus: boolean } | null>(null);
  const subRef = useRef<HTMLButtonElement | null>(null);
  const subPanel = useRef<HTMLDivElement | null>(null);
  const { panels } = shared;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const p = placeRef.current(el.offsetWidth, el.offsetHeight);
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
    el.style.transformOrigin = `${p.originX}px ${p.originY}px`;
    el.dataset.up = String(p.originY > el.offsetHeight / 2);
    panels.add(el);
    if (focusRef.current) enabledItems(el)[0]?.focus({ preventScroll: true });
    const a = still() ? null : el.animate(frames(el), { duration: ENTER_MS, easing: EASE });
    return () => {
      panels.delete(el);
      a?.cancel();
    };
  }, [panels]);

  const openSub = (index: number, button: HTMLButtonElement, focus: boolean) => {
    if (sub?.index === index) {
      if (focus) enabledItems(subPanel.current)[0]?.focus();
      return;
    }
    subRef.current = button;
    setSub({ index, focus });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && onBack) {
      e.preventDefault();
      onBack();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const buttons = enabledItems(ref.current);
    if (buttons.length === 0) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? buttons.length - 1
          : (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  const subItem = sub ? items[sub.index] : undefined;

  return (
    <>
      <div
        ref={(el) => {
          ref.current = el;
          if (panelRef) panelRef.current = el;
        }}
        role="menu"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'fixed top-0 left-0 z-50 flex max-h-[min(420px,calc(100vh-16px))] w-max min-w-[200px] max-w-[320px] flex-col gap-0.5 overflow-y-auto rounded-[20px] bg-[var(--color-bg-tertiary)] p-1.5 shadow-[0_0_0_1px_var(--color-border),0_14px_34px_rgb(0_0_0/34%)] outline-none select-none',
          shared.closing && 'pointer-events-none',
        )}
      >
        {items.map((item, i) => {
          if (item === 'separator') {
            return (
              <hr
                key={`sep-${keyOf(items[i - 1])}`}
                className="my-1 h-px w-full shrink-0 border-0 bg-[var(--color-border)]"
              />
            );
          }
          const danger = 'onSelect' in item && item.danger;
          const isSub = 'items' in item;
          return (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              aria-haspopup={isSub ? 'menu' : undefined}
              aria-expanded={isSub ? sub?.index === i : undefined}
              onPointerEnter={(e) => {
                if (item.disabled) return;
                if (isSub) {
                  openSub(i, e.currentTarget, false);
                  return;
                }
                if (subPanel.current?.contains(document.activeElement)) e.currentTarget.focus();
                setSub(null);
              }}
              onKeyDown={(e) => {
                if (!isSub || (e.key !== 'ArrowRight' && e.key !== 'Enter' && e.key !== ' '))
                  return;
                e.preventDefault();
                e.stopPropagation();
                openSub(i, e.currentTarget, true);
              }}
              onClick={(e) => {
                if (isSub) openSub(i, e.currentTarget, e.detail === 0);
                else shared.select(item);
              }}
              className={cn(
                'group flex h-9 shrink-0 items-center gap-3 rounded-full pr-4 pl-3 text-left text-[13px] font-medium whitespace-nowrap outline-none transition-[background-color,scale] duration-120 disabled:cursor-default disabled:opacity-40',
                danger
                  ? 'text-[var(--color-danger)] enabled:hover:bg-[var(--color-danger-soft)] focus-visible:bg-[var(--color-danger-soft)]'
                  : 'text-[var(--color-text-primary)] enabled:hover:bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)] aria-expanded:bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)]',
              )}
            >
              {item.icon && (
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center',
                    !danger && 'text-[var(--color-text-muted)]',
                  )}
                >
                  {item.icon}
                </span>
              )}
              <span className="min-w-0 truncate">{item.label}</span>
              {'hint' in item && item.hint && (
                <span className="ml-auto pl-4 text-[11px] font-medium text-[var(--color-text-muted)] group-enabled:group-hover:text-[var(--color-text-primary)]">
                  {item.hint}
                </span>
              )}
              {isSub && (
                <ChevronRight
                  aria-hidden
                  className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
                />
              )}
            </button>
          );
        })}
      </div>
      {sub && subItem && subItem !== 'separator' && 'items' in subItem && (
        <Panel
          key={sub.index}
          items={subItem.items}
          shared={shared}
          focusFirst={sub.focus}
          panelRef={subPanel}
          place={(w, h) => {
            const menu = ref.current?.getBoundingClientRect() ?? { left: 0, right: 0 };
            const top = subRef.current?.getBoundingClientRect().top ?? 0;
            return submenuPlacement(menu, top, w, h, {
              width: window.innerWidth,
              height: window.innerHeight,
            });
          }}
          onBack={() => {
            setSub(null);
            subRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  origin?: { x: number; y: number };
}

function Root({ x, y, items, onClose, origin, returnTo }: Props & { returnTo: Element | null }) {
  const panels = useRef(new Set<HTMLElement>()).current;
  const closingRef = useRef(false);
  const exits = useRef<Animation[]>([]);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const els = [...panels];
    const active = document.activeElement;
    if (
      returnTo instanceof HTMLElement &&
      returnTo.isConnected &&
      (active === document.body || els.some((el) => el.contains(active)))
    ) {
      returnTo.focus({ preventScroll: true });
    }
    if (still() || els.length === 0) {
      onCloseRef.current();
      return;
    }
    exits.current = els.map((el) => {
      for (const a of el.getAnimations()) a.cancel();
      return el.animate(frames(el).reverse(), {
        duration: EXIT_MS,
        easing: EASE,
        fill: 'forwards',
      });
    });
    Promise.all(exits.current.map((a) => a.finished))
      .then(() => onCloseRef.current())
      .catch(() => {});
  }, [panels, returnTo]);

  useEffect(
    () => () => {
      for (const a of exits.current) a.cancel();
    },
    [],
  );

  useEffect(() => {
    const inside = (t: EventTarget | null) =>
      t instanceof Node && [...panels].some((el) => el.contains(t));
    const onOutside = (e: Event) => {
      if (!inside(e.target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (closingRef.current || (e.key !== 'Escape' && e.key !== 'Tab')) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('contextmenu', onOutside, true);
    window.addEventListener('wheel', onOutside, { capture: true, passive: true });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('contextmenu', onOutside, true);
      window.removeEventListener('wheel', onOutside, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [panels, close]);

  const shared: Shared = {
    panels,
    closing,
    select: (item) => {
      close();
      item.onSelect();
    },
  };

  return (
    <Panel
      items={items}
      shared={shared}
      focusFirst
      place={(w, h) => {
        const p = menuPlacement(x, y, w, h, {
          width: window.innerWidth,
          height: window.innerHeight,
        });
        if (!origin) return p;
        return {
          ...p,
          originX: Math.max(0, Math.min(origin.x - p.left, w)),
          originY: Math.max(0, Math.min(origin.y - p.top, h)),
        };
      }}
    />
  );
}

export function ContextMenu({ openId, ...props }: Props & { openId?: number }) {
  const key = `${props.x},${props.y},${openId ?? 0}`;
  const [opened, setOpened] = useState(() => ({ key, returnTo: document.activeElement }));
  let { returnTo } = opened;
  if (opened.key !== key) {
    const active = document.activeElement;
    returnTo = active?.closest('[role="menu"]') ? opened.returnTo : active;
    setOpened({ key, returnTo });
  }
  return createPortal(<Root key={key} {...props} returnTo={returnTo} />, document.body);
}

type OpenMenu = (e: React.MouseEvent, items: MenuItem[]) => void;

const MenuContext = createContext<OpenMenu>(() => {});

export const ContextMenuProvider = MenuContext.Provider;

export function useOpenMenu(): OpenMenu {
  return useContext(MenuContext);
}

export function useContextMenu(): { open: OpenMenu; element: ReactNode } {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
    id: number;
  } | null>(null);
  const seq = useRef(0);
  const open = useCallback<OpenMenu>((e, items) => {
    e.preventDefault();
    e.stopPropagation();
    seq.current += 1;
    setMenu({ ...menuPoint(e), items, id: seq.current });
  }, []);
  const close = useCallback(() => setMenu(null), []);
  const element = menu && (
    <ContextMenu x={menu.x} y={menu.y} items={menu.items} openId={menu.id} onClose={close} />
  );
  return { open, element };
}
