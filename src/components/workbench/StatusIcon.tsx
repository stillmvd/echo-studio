import {
  Bot,
  Check,
  FilePen,
  FileText,
  Globe,
  type LucideIcon,
  MessageCircleQuestion,
  Pause,
  Power,
  Search,
  Sparkles,
  SquareTerminal,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ClaudeSession } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/workbench';

const TOOL_ICONS: [RegExp, LucideIcon][] = [
  [/^bash|powershell/i, SquareTerminal],
  [/^(edit|write|multiedit|notebookedit)/i, FilePen],
  [/^read/i, FileText],
  [/^(grep|glob|search)/i, Search],
  [/^web/i, Globe],
  [/^(task|agent)/i, Bot],
];

function iconOf(s: Pick<ClaudeSession, 'status' | 'phase' | 'tool'>): LucideIcon {
  switch (s.status) {
    case 'waiting':
      return MessageCircleQuestion;
    case 'done':
      return Check;
    case 'error':
      return X;
    case 'exited':
      return Power;
    case 'idle':
      return Pause;
    case 'working':
      if (s.phase === 'agents') return Bot;
      if (s.phase === 'tool' && s.tool) {
        return TOOL_ICONS.find(([re]) => re.test(s.tool ?? ''))?.[1] ?? Wrench;
      }
      return Sparkles;
  }
}

export function StatusIcon({
  session,
  small,
}: {
  session: Pick<ClaudeSession, 'status' | 'phase' | 'tool'>;
  small?: boolean;
}) {
  const Icon = iconOf(session);
  return (
    <span
      className={cn('wb-gl', `st-${session.status}`, small && 'sm')}
      title={STATUS_LABEL[session.status]}
    >
      <Icon strokeWidth={2.25} />
    </span>
  );
}
