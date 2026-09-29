export function buildDraft(state, sessionId, now = new Date()) {
  const first = state.first_prompt ?? '—';
  const title = (state.first_prompt ?? '').split('\n')[0].slice(0, 80) || 'Сессия без итога';
  const recent = state.recent.length
    ? state.recent
        .map(
          (r) =>
            `- **${r.role === 'user' ? 'Пользователь' : 'Claude'}:** ${r.text.replace(/\s+/g, ' ')}`,
        )
        .join('\n')
    : '—';
  const files = state.touched.filter((f) => !f.replace(/\\/g, '/').includes('/.claude/projects/'));
  const touched = files.length ? files.map((f) => `- \`${f}\``).join('\n') : '—';
  return `---
name: session-${sessionId.slice(0, 8)}
description: "Черновик: ${title.replace(/"/g, "'")}"
metadata:
  type: project
  session_id: ${sessionId}
  capture: extractive
  updated: ${now.toISOString()}
---

## Первый запрос

${first}

## Последние реплики

${recent}

## Тронутые файлы

${touched}
`;
}
