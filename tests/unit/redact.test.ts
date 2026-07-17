import { describe, it, expect } from 'vitest';
import { redactSecrets, maskValue, isPlaceholder, toEvidence } from '@/lib/scanner/redact';

describe('redactSecrets', () => {
  it('masks AWS access key ids', () => {
    const out = redactSecrets('key is AKIAIOSFODNN7EXAMPLE here');
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(out).toContain('••••');
  });

  it('masks OpenAI-style keys', () => {
    const out = redactSecrets('OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz0123456789');
    expect(out).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('masks credentials inside connection strings', () => {
    const out = redactSecrets('postgres://user:supersecret@db.example.com:5432/app');
    expect(out).not.toContain('supersecret');
    expect(out).toContain('••••');
  });

  it('redacts private key blocks', () => {
    const out = redactSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIsecret\n-----END RSA PRIVATE KEY-----');
    expect(out).not.toContain('MIIsecret');
    expect(out).toContain('redacted key material');
  });

  it('masks secret assignments', () => {
    const out = redactSecrets('const password = "hunter2horse"');
    expect(out).not.toContain('hunter2horse');
  });

  it('leaves obvious placeholders alone', () => {
    const out = redactSecrets('API_KEY=your-api-key-here');
    expect(out).toContain('your-api-key-here');
  });

  it('is idempotent', () => {
    const once = redactSecrets('token=abcdef123456ghijkl');
    const twice = redactSecrets(once);
    expect(twice).toBe(once);
  });
});

describe('maskValue', () => {
  it('fully masks short values', () => {
    expect(maskValue('short')).toBe('••••••••');
  });
  it('keeps a small prefix and suffix for long values', () => {
    const masked = maskValue('ABCDEFGHIJKLMNOP');
    expect(masked.startsWith('ABCD')).toBe(true);
    expect(masked).toContain('redacted');
  });
});

describe('isPlaceholder', () => {
  it('detects common placeholders', () => {
    for (const v of ['your-value', 'changeme', 'xxx', 'example', '<token>', '${VAR}', 'process.env.X', '']) {
      expect(isPlaceholder(v)).toBe(true);
    }
  });
  it('does not treat real-looking values as placeholders', () => {
    expect(isPlaceholder('a8f3kd92lfjs01')).toBe(false);
  });
});

describe('toEvidence', () => {
  it('flattens whitespace and clips length', () => {
    const out = toEvidence('a\n\n  b   c'.padEnd(500, 'x'), 50);
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out).not.toContain('\n');
  });
  it('redacts while clipping', () => {
    const out = toEvidence('secret token AKIAIOSFODNN7EXAMPLE trailing');
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });
});
