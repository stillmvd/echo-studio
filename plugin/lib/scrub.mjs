const R = '[REDACTED]';

const PATTERNS = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, R],
  [/<private>[\s\S]*?<\/private>/gi, R],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/g, R],
  [/\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}/g, R],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, R],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, R],
  [/\bAKIA[0-9A-Z]{16}\b/g, R],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, R],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, R],
  [
    /\b((?:password|passwd|secret|token|api[_-]?key)["']?\s*[:=]\s*)["']?[^\s"'`,;]{4,}["']?/gi,
    `$1${R}`,
  ],
];

const NOISE = [
  /<system-reminder>[\s\S]*?<\/system-reminder>\s*/g,
  /<task-notification>[\s\S]*?<\/task-notification>\s*/g,
  /<memory-context\b[^>]*>[\s\S]*?<\/memory-context>\s*/g,
];

export function scrub(text) {
  let out = text;
  for (const re of NOISE) out = out.replace(re, '');
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out;
}
