import { describe, expect, it } from 'vitest';
import { scrub } from './scrub.mjs';

const secrets = [
  'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx',
  'sk-proj-AbCdEfGhIjKlMnOpQrStUv12',
  'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
  'github_pat_11ABCDEFG0123456789_abcdefghijklmnop',
  'xoxb-123456789012-abcdefghijkl',
  'AKIAIOSFODNN7EXAMPLE',
  'AIzaSyA1234567890abcdefghijklmnopqrstu',
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
  '<private>мой пароль от всего</private>',
];

describe('scrub', () => {
  it('redacts every secret of the test set (SC-005)', () => {
    for (const s of secrets) {
      const out = scrub(`до ${s} после`);
      expect(out).toContain('[REDACTED]');
      expect(out).not.toContain(s);
    }
  });

  it('redacts key = value assignments but keeps the key', () => {
    expect(scrub('password: hunter2x')).toBe('password: [REDACTED]');
    expect(scrub('API_KEY="abcd1234"')).toBe('API_KEY=[REDACTED]');
  });

  it('strips service tags', () => {
    expect(scrub('a<system-reminder>x</system-reminder>\nb')).toBe('ab');
    expect(scrub('<memory-context note="n">протокол</memory-context>\nтекст')).toBe('текст');
  });

  it('leaves ordinary text alone', () => {
    const text = 'Токен сессии хранится в zustand; ключ skill-overrides; sk-short';
    expect(scrub(text)).toBe(text);
  });
});
