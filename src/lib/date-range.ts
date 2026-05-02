import type { DateRangePreset } from '@/state/ui-store';

export function dateFromPreset(preset: DateRangePreset): string | undefined {
  if (preset === 'all') return undefined;
  const days = preset === 'last7' ? 7 : preset === 'last30' ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
