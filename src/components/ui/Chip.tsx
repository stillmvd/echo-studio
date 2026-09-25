export function Chip({ value, unit }: { value: string | number; unit: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-[var(--color-bg-tertiary)] px-[9px] text-[11px] font-medium text-[var(--color-text-muted)] tabular-nums">
      <b className="mr-1 font-bold text-[var(--color-text-primary)]">{value}</b>
      {unit}
    </span>
  );
}
