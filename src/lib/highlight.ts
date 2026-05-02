export function tokenizeQuery(q: string): string[] {
  if (!q) return [];
  return Array.from(
    new Set(
      q
        .split(/[^\p{L}\p{N}]+/u)
        .map((t) => t.toLowerCase())
        .filter((t) => t.length > 1),
    ),
  );
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

export function splitHighlighted(text: string, terms: string[]): HighlightSegment[] {
  if (!text || terms.length === 0) return [{ text, match: false }];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'giu');
  const out: HighlightSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx), match: false });
    out.push({ text: m[0], match: true });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false });
  return out;
}
