/**
 * Redaction utilities.
 *
 * Any value that looks like a credential is masked before it is stored in a
 * finding, returned from an API route, exported to a report or sent to the
 * OpenAI API. Raw secrets never leave the scanning pipeline.
 */

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /ASIA[0-9A-Z]{16}/g, // AWS temporary access key id
  /ghp_[A-Za-z0-9]{36,}/g, // GitHub personal access token
  /gho_[A-Za-z0-9]{36,}/g, // GitHub OAuth token
  /github_pat_[A-Za-z0-9_]{36,}/g, // GitHub fine-grained PAT
  /sk-[A-Za-z0-9_-]{20,}/g, // OpenAI-style secret key
  /sk_live_[A-Za-z0-9]{16,}/g, // Stripe live secret key
  /sk_test_[A-Za-z0-9]{16,}/g, // Stripe test secret key
  /rk_live_[A-Za-z0-9]{16,}/g, // Stripe restricted key
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /AIza[0-9A-Za-z_-]{35}/g, // Google API key
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/gi, // conn string creds
];

/** Assignments like PASSWORD=..., "apiKey": "...", secret: '...' */
const SECRET_ASSIGNMENT = /((?:password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret|access[_-]?key|auth)[a-z0-9_-]*\s*[:=]\s*['"]?)([^'"\s]{6,})(['"]?)/gi;

/** Mask a single secret-like value, keeping a small identifying prefix. */
export function maskValue(value: string): string {
  if (value.length <= 8) return '••••••••';
  const prefix = value.slice(0, 4);
  const suffix = value.slice(-2);
  return `${prefix}••••••••${suffix} (redacted, ${value.length} chars)`;
}

/**
 * Redact all secret-like substrings in a piece of evidence text.
 * Deterministic and idempotent.
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, (match) => {
      if (match.startsWith('-----BEGIN')) {
        return '-----BEGIN PRIVATE KEY----- ••••••••(redacted key material)';
      }
      if (/^(postgres|postgresql|mysql|mongodb|redis|amqp)/i.test(match)) {
        return match.replace(/:\/\/[^\s:@/]+:[^\s@/]+@/, '://••••:••••@');
      }
      return maskValue(match);
    });
  }
  out = out.replace(SECRET_ASSIGNMENT, (_m, lead: string, value: string, trail: string) => {
    if (value.includes('••••')) return `${lead}${value}${trail}`;
    if (isPlaceholder(value)) return `${lead}${value}${trail}`;
    return `${lead}${maskValue(value)}${trail}`;
  });
  return out;
}

/** Values that are clearly documentation placeholders and safe to show. */
export function isPlaceholder(value: string): boolean {
  const v = value.trim().replace(/^['"]|['"]$/g, '');
  if (v.length === 0) return true;
  return (
    /^(your|my|xxx+|placeholder|changeme|change-me|example|sample|dummy|test|todo|<[^>]*>|\$\{[^}]*\}|\$[A-Z_]+|process\.env)/i.test(v) ||
    /(_here|-here|\.\.\.)$/i.test(v) ||
    /^(true|false|null|undefined|none|empty)$/i.test(v)
  );
}

/** Trim evidence to a safe, single-line, bounded snippet. */
export function toEvidence(raw: string, maxLength = 200): string {
  const flattened = raw.replace(/\s+/g, ' ').trim();
  // SEC-1: Redact first, then clip — prevents secrets straddling the boundary.
  const redacted = redactSecrets(flattened);
  const clipped = redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
  return clipped;
}
