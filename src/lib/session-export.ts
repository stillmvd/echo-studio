import type { SessionEvent } from './types';

const ROLE_LABEL: Record<string, string> = {
  user: 'User',
  assistant: 'Assistant',
  tool_use: 'Tool use',
  tool_result: 'Tool result',
  system: 'System',
};

export function eventsToMarkdown(sessionId: string, events: SessionEvent[]): string {
  const first = events[0];
  const last = events[events.length - 1];

  const header = [
    `# Session ${sessionId}`,
    '',
    `- Events: **${events.length}**`,
    first?.timestamp ? `- First event: ${first.timestamp}` : null,
    last?.timestamp ? `- Last event: ${last.timestamp}` : null,
    `- Exported: ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const body = events
    .map((ev) => {
      const label = ROLE_LABEL[ev.eventType] ?? ev.eventType;
      const subtype = ev.subtype ? ` · ${ev.subtype}` : '';
      const time = ev.timestamp ? ` · ${ev.timestamp}` : '';
      const heading = `## ${label}${subtype}${time}`;

      const content = ev.summary || '(empty)';

      return [heading, '', content, ''].join('\n');
    })
    .join('\n');

  return `${header}${body}`;
}
