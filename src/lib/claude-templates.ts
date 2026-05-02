import type { Memory, MemoryWithBody } from './types';

export type ClaudeTemplate = 'save' | 'update' | 'investigate';

export const TEMPLATE_LABELS: Record<ClaudeTemplate, string> = {
  save: 'Save new',
  update: 'Update existing',
  investigate: 'Investigate',
};

export interface TemplateContext {
  project: string | null;
  memory: Memory | MemoryWithBody | null;
  topic: string;
}

export function buildPrompt(template: ClaudeTemplate, ctx: TemplateContext): string {
  switch (template) {
    case 'save':
      return saveTemplate(ctx);
    case 'update':
      return updateTemplate(ctx);
    case 'investigate':
      return investigateTemplate(ctx);
  }
}

function saveTemplate(ctx: TemplateContext): string {
  const projectLine = ctx.project ? `Project: ${ctx.project}` : 'Project: (auto-detect from cwd)';
  const topic = ctx.topic.trim() || '<тема>';
  return [
    `Сохрани новую memory в EchoVault через memory_save MCP-tool.`,
    ``,
    projectLine,
    `Тема: ${topic}`,
    ``,
    `Контекст и детали:`,
    `<опиши что узнали / решили / какой паттерн>`,
    ``,
    `Заполни обязательные поля: title, what, why, impact, category`,
    `(decision | pattern | bug | context | learning), tags (массив).`,
    `Опционально — details (длинный markdown body) и related_files.`,
  ].join('\n');
}

function updateTemplate(ctx: TemplateContext): string {
  const m = ctx.memory;
  if (!m) {
    return 'Обнови memory в EchoVault. Сначала найди её через memory_search, затем используй memory_save с тем же id.';
  }
  const tags = m.tags.length > 0 ? m.tags.map((t) => `#${t}`).join(' ') : '(none)';
  const body = ctx.topic.trim() || '<что нужно изменить>';
  return [
    `Обнови существующую memory в EchoVault через memory_save MCP-tool.`,
    ``,
    `id: ${m.id}`,
    `title: ${m.title}`,
    `project: ${m.project}`,
    `category: ${m.category ?? '(none)'}`,
    `tags: ${tags}`,
    ``,
    `Текущее содержание:`,
    `- what: ${m.what}`,
    m.why ? `- why: ${m.why}` : null,
    m.impact ? `- impact: ${m.impact}` : null,
    ``,
    `Что нужно изменить / добавить:`,
    body,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function investigateTemplate(ctx: TemplateContext): string {
  const m = ctx.memory;
  if (!m) {
    return 'Исследуй вопрос: <тема>. Используй memory_search для контекста.';
  }
  const files =
    m.relatedFiles.length > 0
      ? m.relatedFiles.map((f) => `- ${f}`).join('\n')
      : '(нет related_files)';
  const body = ctx.topic.trim() || '<задача>';
  return [
    `Исследуй memory ${m.id} ("${m.title}") и её related_files.`,
    ``,
    `Project: ${m.project}`,
    `Category: ${m.category ?? '(none)'}`,
    ``,
    `Контекст memory:`,
    `- what: ${m.what}`,
    m.why ? `- why: ${m.why}` : null,
    m.impact ? `- impact: ${m.impact}` : null,
    ``,
    `Related files:`,
    files,
    ``,
    `Задача:`,
    body,
  ]
    .filter((line) => line !== null)
    .join('\n');
}
