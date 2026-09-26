import { Blocks, Bot, type LucideIcon, Plug, Server, Sparkle, SquareTerminal } from 'lucide-react';
import type { KindFilter } from '@/lib/tooling';

export const KIND_META: Record<KindFilter, { label: string; icon: LucideIcon }> = {
  all: { label: 'All', icon: Blocks },
  skill: { label: 'Skills', icon: Sparkle },
  plugin: { label: 'Plugins', icon: Plug },
  mcp: { label: 'MCP', icon: Server },
  command: { label: 'Commands', icon: SquareTerminal },
  agent: { label: 'Agents', icon: Bot },
};

export const KIND_ORDER: KindFilter[] = ['all', 'skill', 'plugin', 'mcp', 'command', 'agent'];
