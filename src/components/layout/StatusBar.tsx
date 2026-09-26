export function StatusBar() {
  return (
    <div
      role="status"
      className="absolute right-6 bottom-6 z-20 grid h-11 w-11 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[0_10px_26px_rgb(0_0_0/30%)]"
    >
      <span className="h-2 w-2 rounded-full bg-[var(--color-success)] shadow-[0_0_8px_rgb(95_201_138/55%)]" />
    </div>
  );
}
