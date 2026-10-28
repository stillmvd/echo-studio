export interface Segment {
  text: string;
  hit: boolean;
}

export function highlightSegments(text: string, query: string): Segment[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const out: Segment[] = [];
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) out.push({ text: text.slice(from, at), hit: false });
    out.push({ text: text.slice(at, at + q.length), hit: true });
    from = at + q.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false });
  return out;
}
