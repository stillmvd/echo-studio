import {
  Bug,
  FileText,
  GitBranch,
  Lightbulb,
  type LucideIcon,
  SquarePlus,
  TriangleAlert,
} from 'lucide-react';
import type { KindFilter } from '@/lib/memory';

export const KIND_VIEW: Record<
  Exclude<KindFilter, 'all'>,
  { label: string; Icon: LucideIcon; color: string }
> = {
  decision: { label: 'decision', Icon: GitBranch, color: 'text-[var(--color-accent)]' },
  gotcha: { label: 'gotcha', Icon: TriangleAlert, color: 'text-[var(--color-warning)]' },
  bugfix: { label: 'bugfix', Icon: Bug, color: 'text-[var(--color-danger)]' },
  feature: { label: 'feature', Icon: SquarePlus, color: 'text-[var(--color-success)]' },
  discovery: { label: 'discovery', Icon: Lightbulb, color: 'text-[var(--color-violet)]' },
  other: { label: 'прочее', Icon: FileText, color: 'text-[var(--color-text-muted)]' },
};

export const chipBase =
  'inline-flex h-6 items-center gap-1 rounded-full px-[9px] text-[11px] font-medium whitespace-nowrap tabular-nums';
export const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]';
