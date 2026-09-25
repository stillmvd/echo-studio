import type { DisplayItem } from './types';

export interface ToolStep {
  key: string;
  use: DisplayItem | null;
  result: DisplayItem | null;
}

export type FeedNode =
  | {
      type: 'message';
      key: string;
      item: DisplayItem;
      text: string;
      paste: string | null;
      thought: boolean;
      turnMs: number | null;
    }
  | { type: 'command'; key: string; name: string; output: string | null }
  | { type: 'skill'; key: string; name: string; text: string }
  | { type: 'tools'; key: string; steps: ToolStep[] }
  | { type: 'recap'; key: string; text: string }
  | { type: 'image'; key: string; item: DisplayItem }
  | { type: 'system'; key: string; item: DisplayItem };

const TURN_KINDS = new Set(['system_turn_duration', 'system_away_summary']);

export function isHideableSystemKind(kind: string): boolean {
  return (kind.startsWith('system_') || kind.startsWith('meta_')) && !TURN_KINDS.has(kind);
}

const isTool = (item: DisplayItem) => item.kind === 'tool_use' || item.kind === 'tool_result';

function tagContent(text: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)(?:</${tag}>|$)`).exec(text);
  return m ? (m[1] ?? '').trim() : null;
}

export function pairTools(run: DisplayItem[]): ToolStep[] {
  const steps: ToolStep[] = run
    .filter((i) => i.kind === 'tool_use')
    .map((use) => ({ key: use.uuid, use, result: null }));
  for (const result of run.filter((i) => i.kind === 'tool_result')) {
    let idx = steps.findIndex(
      (s) => !s.result && s.use && s.use.uuid.split(':')[0] === result.parentUuid,
    );
    if (idx === -1) idx = steps.findIndex((s) => !s.result && s.use);
    const step = steps[idx];
    if (step) step.result = result;
    else steps.push({ key: result.uuid, use: null, result });
  }
  return steps;
}

export function buildFeed(items: DisplayItem[]): FeedNode[] {
  const nodes: FeedNode[] = [];
  let thought = false;
  let i = 0;
  while (i < items.length) {
    const item = items[i] as DisplayItem;
    if (isTool(item)) {
      const run: DisplayItem[] = [];
      while (i < items.length && isTool(items[i] as DisplayItem))
        run.push(items[i++] as DisplayItem);
      nodes.push({ type: 'tools', key: run[0]?.uuid ?? String(i), steps: pairTools(run) });
      continue;
    }
    i += 1;
    const text = item.text ?? '';
    switch (item.kind) {
      case 'thinking':
        thought = true;
        break;
      case 'system_turn_duration': {
        const ms = Number(/(\d+)\s*ms/.exec(text)?.[1]);
        const last = nodes[nodes.length - 1];
        if (
          last?.type === 'message' &&
          last.item.kind === 'assistant_text' &&
          Number.isFinite(ms)
        ) {
          last.turnMs = ms;
        }
        break;
      }
      case 'system_away_summary':
        nodes.push({
          type: 'recap',
          key: item.uuid,
          text: text.replace(/\s*\(disable recaps[^)]*\)\s*$/, '').trim(),
        });
        break;
      case 'user_text': {
        const trimmed = text.trim();
        if (trimmed.startsWith('<local-command-caveat>')) break;
        const command = tagContent(trimmed, 'command-name');
        if (command !== null) {
          const next = items[i];
          const output =
            next?.kind === 'user_text' ? tagContent(next.text ?? '', 'local-command-stdout') : null;
          if (output !== null) i += 1;
          nodes.push({ type: 'command', key: item.uuid, name: command, output });
          break;
        }
        const stdout = trimmed.startsWith('<local-command-stdout>')
          ? tagContent(trimmed, 'local-command-stdout')
          : null;
        if (stdout !== null) {
          nodes.push({ type: 'command', key: item.uuid, name: '', output: stdout });
          break;
        }
        const skill = /^Base directory for this skill:\s*(.+)$/m.exec(trimmed);
        if (skill && trimmed.startsWith('Base directory for this skill:')) {
          const name = (skill[1] ?? '').trim().split(/[\\/]/).filter(Boolean).pop() ?? 'skill';
          const body = trimmed.slice((skill[0] ?? '').length).trim();
          nodes.push({ type: 'skill', key: item.uuid, name, text: body });
          break;
        }
        const paste = tagContent(trimmed, 'pasted_content');
        const rest =
          paste === null
            ? trimmed
            : trimmed.replace(/<pasted_content[^>]*>[\s\S]*?(?:<\/pasted_content>|$)/, '').trim();
        nodes.push({
          type: 'message',
          key: item.uuid,
          item,
          text: rest,
          paste,
          thought: false,
          turnMs: null,
        });
        break;
      }
      case 'assistant_text':
        nodes.push({
          type: 'message',
          key: item.uuid,
          item,
          text,
          paste: null,
          thought,
          turnMs: null,
        });
        thought = false;
        break;
      case 'image':
        nodes.push({ type: 'image', key: item.uuid, item });
        break;
      default:
        nodes.push({ type: 'system', key: item.uuid, item });
    }
  }
  return nodes;
}

export function nodeText(node: FeedNode): string {
  const parts: (string | null | undefined)[] = (() => {
    switch (node.type) {
      case 'message':
        return [node.text, node.paste];
      case 'command':
        return [node.name, node.output];
      case 'skill':
        return [node.name, node.text];
      case 'tools':
        return node.steps.flatMap((s) => [
          s.use?.toolName,
          s.use?.toolInputSummary,
          s.result?.text,
        ]);
      case 'recap':
        return [node.text];
      case 'image':
        return [];
      case 'system':
        return [node.item.kind, node.item.text];
    }
  })();
  return parts.filter(Boolean).join(' ').toLowerCase();
}
