const NAV_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export function installKeyboardMode(): void {
  const root = document.documentElement;
  window.addEventListener(
    'keydown',
    (e) => {
      if (NAV_KEYS.has(e.key)) root.dataset.keys = '';
    },
    true,
  );
  window.addEventListener('pointerdown', () => delete root.dataset.keys, true);
}
