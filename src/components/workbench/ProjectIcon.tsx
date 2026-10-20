import { Folder } from 'lucide-react';
import { cn } from '@/lib/cn';

export function ProjectIcon({ svg, size }: { svg: string | null; size?: 'lg' | 'xl' }) {
  if (!svg) {
    return (
      <span className={cn('wb-pi none', size)}>
        <Folder strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <span className={cn('wb-pi', size)}>
      <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="" draggable={false} />
    </span>
  );
}
