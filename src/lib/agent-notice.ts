import type { DisplayItem } from './types';

export type NoticeSource = 'agent' | 'command' | 'monitor' | 'other';

export interface AgentNotice {
  source: NoticeSource;
  name: string | null;
  summary: string;
  status: string | null;
  result: string | null;
}

const OPEN = '<task-notification>';

function tag(text: string, name: string): string | null {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text);
  return m ? (m[1] ?? '').trim() : null;
}

function isNotice(item: DisplayItem, text: string): boolean {
  const origin = (item.raw as { origin?: { kind?: unknown } } | null)?.origin;
  if (origin) return origin.kind === 'task-notification';
  return text.startsWith(OPEN);
}

function sourceOf(summary: string): NoticeSource {
  if (summary.startsWith('Agent ')) return 'agent';
  if (summary.startsWith('Background ')) return 'command';
  if (summary.startsWith('Monitor')) return 'monitor';
  return 'other';
}

export function parseAgentNotice(item: DisplayItem): AgentNotice | null {
  if (item.kind !== 'user_text') return null;
  const text = (item.text ?? '').trim();
  if (!isNotice(item, text) || !text.startsWith(OPEN)) return null;
  const summary = tag(text, 'summary');
  const status = tag(text, 'status');
  if (summary === null && status === null) return null;
  const line = summary ?? '';
  return {
    source: sourceOf(line),
    name: /"([^"]*)"/.exec(line)?.[1] ?? null,
    summary: line,
    status,
    result: tag(text, 'result') || null,
  };
}
