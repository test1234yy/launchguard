import type { Finding } from './types';

/**
 * Stable report fingerprint.
 *
 * Unlike report.id (unique per run), the fingerprint depends only on the
 * findings and score: two scans of identical content produce the same value,
 * so it works for caching, deduping and "did anything change?" comparisons.
 */

/** FNV-1a 32-bit hash of a string, as 8 lowercase hex chars. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiplication via shifts to stay in integer range.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Deterministic fingerprint over the material content of a report. */
export function reportFingerprint(findings: Finding[], score: number): string {
  const material = findings
    .map((f) => `${f.ruleId}|${f.severity}|${f.file}|${f.line ?? 0}`)
    .sort()
    .join('\n');
  return fnv1a(`${score}\n${material}`);
}
