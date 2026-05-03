import type { DisplayItem } from './types';

function labelFor(item: DisplayItem): string {
  if (item.kind === 'user_text') return 'User';
  if (item.kind === 'assistant_text') return 'Assistant';
  if (item.kind === 'thinking') return 'Assistant (thinking)';
  if (item.kind === 'tool_use') return `Tool: ${item.toolName ?? '?'}`;
  if (item.kind === 'tool_result') return item.isError ? 'Tool error' : 'Tool result';
  if (item.kind === 'image') return 'Image';
  return item.kind;
}

export function eventsToMarkdown(sessionId: string, events: DisplayItem[]): string {
  const first = events[0];
  const last = events[events.length - 1];

  const header = [
    `# Session ${sessionId}`,
    '',
    `- Items: **${events.length}**`,
    first?.timestamp ? `- First: ${first.timestamp}` : null,
    last?.timestamp ? `- Last: ${last.timestamp}` : null,
    `- Exported: ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const body = events
    .filter((ev) => !ev.kind.startsWith('system_') && !ev.kind.startsWith('meta_'))
    .map((ev) => {
      const time = ev.timestamp ? ` · ${ev.timestamp}` : '';
      const heading = `## ${labelFor(ev)}${time}`;

      let content = '';
      if (ev.kind === 'tool_use') {
        content = `\`\`\`\n${ev.toolName ?? ''}: ${ev.toolInputSummary ?? ''}\n\`\`\``;
      } else if (ev.kind === 'tool_result') {
        const text = ev.text ?? '';
        content = `\`\`\`\n${text}\n\`\`\``;
      } else {
        content = ev.text ?? '(empty)';
      }

      return [heading, '', content, ''].join('\n');
    })
    .join('\n');

  return `${header}${body}`;
}
