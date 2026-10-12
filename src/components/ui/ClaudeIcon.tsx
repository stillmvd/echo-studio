import claude from '@/assets/claude.png';
import { cn } from '@/lib/cn';

export function ClaudeIcon({ className }: { className?: string }) {
  return <img src={claude} alt="" draggable={false} className={cn('h-3.5 w-3.5', className)} />;
}
