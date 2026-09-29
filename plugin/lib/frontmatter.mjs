const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function scalar(raw) {
  const value = raw.replace(/\s+#.*$/, '').trim();
  if (/^\[.*\]$/.test(value)) {
    return value
      .slice(1, -1)
      .split(',')
      .map((v) => scalar(v))
      .filter((v) => v !== '');
  }
  const quoted = /^(['"])(.*)\1$/.exec(value);
  if (quoted) return quoted[2];
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value === 'null' || value === '~') return null;
  return value;
}

export function parse(text) {
  const normalized = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { fields: {}, body: normalized, error: null };
  const end = normalized.indexOf('\n---', 3);
  if (end < 0) return { fields: {}, body: normalized, error: 'frontmatter is not closed' };
  const fields = {};
  let key = null;
  let sub = null;
  for (const line of normalized.slice(4, end).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const item = /^\s+-\s*(.*)$/.exec(line);
    const pair = /^\s*([\w-]+):\s*(.*)$/.exec(line);
    if (item && key) {
      const target = sub && indent > 2 && isMap(fields[key]) ? fields[key] : fields;
      const name = target === fields ? key : sub;
      if (!Array.isArray(target[name])) target[name] = [];
      target[name].push(scalar(item[1]));
    } else if (pair && indent > 0 && key) {
      if (!isMap(fields[key])) fields[key] = {};
      sub = pair[1];
      fields[key][sub] = pair[2].trim() === '' ? null : scalar(pair[2]);
    } else if (pair && indent === 0) {
      key = pair[1];
      sub = null;
      fields[key] = pair[2].trim() === '' ? null : scalar(pair[2]);
    }
  }
  const body = normalized.slice(end + 4).replace(/^[^\n]*\n/, '');
  return { fields, body, error: null };
}

export function field(fields, key) {
  const meta = fields.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta) && meta[key] !== undefined) {
    return meta[key];
  }
  return fields[key];
}
