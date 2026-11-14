import { describe, expect, it } from 'vitest';
import { extract, matches, render, snippets, titleOf } from './history.mjs';

const at = (m) => `2026-11-01T10:${String(m).padStart(2, '0')}:00.000Z`;

const entries = [
  { type: 'ai-title', aiTitle: 'Переезд на Kimi' },
  {
    type: 'user',
    timestamp: at(0),
    cwd: 'C:\\P\\Echo',
    gitBranch: 'main',
    message: { content: 'Как перенести хуки?<system-reminder>шум</system-reminder>' },
  },
  { type: 'user', isMeta: true, timestamp: at(1), message: { content: 'служебное' } },
  {
    type: 'assistant',
    timestamp: at(2),
    message: {
      content: [
        { type: 'thinking', thinking: 'скрыто' },
        { type: 'text', text: 'Через config.toml.' },
        { type: 'tool_use', name: 'Bash', input: { command: 'kimi doctor' } },
      ],
    },
  },
  {
    type: 'assistant',
    timestamp: at(3),
    message: { content: [{ type: 'text', text: 'Готово.' }] },
  },
  {
    type: 'user',
    timestamp: at(4),
    message: { content: [{ type: 'tool_result', content: 'вывод' }] },
  },
  {
    type: 'user',
    timestamp: at(5),
    message: { content: '<command-name>/commit</command-name><command-args>--all</command-args>' },
  },
  { type: 'user', isSidechain: true, timestamp: at(6), message: { content: 'субагент' } },
  { type: 'custom-title', customTitle: 'kimi-hooks' },
];

describe('extract', () => {
  const s = extract(entries, 'C:\\x\\abc-123.jsonl');

  it('keeps dialogue, drops noise, meta, tool results and sidechains', () => {
    expect(s.id).toBe('abc-123');
    expect(s.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(s.turns[0].text).toBe('Как перенести хуки?');
    expect(s.turns[1].text).toBe('Через config.toml.\n[Bash: kimi doctor]\nГотово.');
    expect(s.turns[2].text).toBe('/commit --all');
    expect(JSON.stringify(s)).not.toContain('скрыто');
    expect(JSON.stringify(s)).not.toContain('субагент');
  });

  it('prefers the custom title and remembers place and time', () => {
    expect(titleOf(s)).toBe('kimi-hooks');
    expect(s.cwd).toBe('C:\\P\\Echo');
    expect(s.branch).toBe('main');
    expect(s.start).toBe(at(0));
    expect(s.end).toBe(at(5));
  });

  it('searches all words and cuts snippets', () => {
    expect(matches(s, ['kimi', 'doctor'])).toBe(true);
    expect(matches(s, ['kimi', 'нет-такого'])).toBe(false);
    expect(snippets(s, ['doctor'])[0]).toMatchObject({ turn: 1, role: 'assistant' });
  });

  it('renders in pages', () => {
    const page = render(s, { max: 200 });
    expect(page).toContain('# kimi-hooks');
    expect(page).toContain('## 1. Пользователь');
    expect(page).toMatch(/read abc-123 --from \d/);
    expect(render(s, { from: 2 })).toContain('## 3. Пользователь');
  });
});
