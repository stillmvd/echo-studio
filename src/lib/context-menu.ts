export function menuPoint(e: React.MouseEvent): { x: number; y: number } {
  if (e.clientX !== 0 || e.clientY !== 0) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + 24, y: r.top + r.height / 2 };
}

export function installNativeMenuGuard(allowWithShift: boolean): () => void {
  const onContextMenu = (e: MouseEvent) => {
    if (allowWithShift && e.shiftKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return;
    if (window.getSelection()?.toString()) return;
    e.preventDefault();
  };
  window.addEventListener('contextmenu', onContextMenu);
  return () => window.removeEventListener('contextmenu', onContextMenu);
}
