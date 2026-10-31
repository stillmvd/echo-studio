import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();
let shown = true;
let active = true;

function update() {
  const next = document.visibilityState === 'visible' && shown;
  if (next === active) return;
  active = next;
  document.documentElement.toggleAttribute('data-idle', !active);
  for (const l of listeners) l(active);
}

export const isWindowActive = () => active;

export function onWindowActive(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function installWindowActivity(): void {
  const setShown = (value: boolean) => {
    shown = value;
    update();
  };
  window.addEventListener('focus', () => setShown(true));
  document.addEventListener('visibilitychange', update);
  getCurrentWindow()
    .onFocusChanged(({ payload }) => payload && setShown(true))
    .catch(() => {});
  let heard = false;
  listen<boolean>('window://visible', ({ payload }) => {
    heard = true;
    setShown(payload);
  }).catch(() => {});
  invoke<boolean>('window_visible').then(
    (value) => heard || setShown(value),
    () => {},
  );
  update();
}
