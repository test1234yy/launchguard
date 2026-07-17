import type { Finding, Severity, SeverityCounts } from './types';

/**
 * Readiness score: deterministic 0–100.
 *
 * Starts at 100 and subtracts a weighted penalty per finding. To stop one
 * noisy rule from zeroing the score, each rule contributes at most
 * MAX_COUNTED_PER_RULE findings; further duplicates cost a nominal amount.
 */

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 22,
  high: 13,
  medium: 7,
  low: 3,
  info: 1,
};

const MAX_COUNTED_PER_RULE = 3;
const OVERFLOW_PENALTY = 0.5;

export function computeScore(findings: Finding[]): number {
  const perRule = new Map<string, number>();
  let penalty = 0;
  for (const finding of findings) {
    const seen = perRule.get(finding.ruleId) ?? 0;
    perRule.set(finding.ruleId, seen + 1);
    penalty += seen < MAX_COUNTED_PER_RULE ? SEVERITY_WEIGHT[finding.severity] : OVERFLOW_PENALTY;
  }
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

export function gradeFor(score: number): string {
  if (score >= 90) return 'Launch ready';
  if (score >= 75) return 'Nearly ready';
  if (score >= 50) return 'Needs work';
  if (score >= 25) return 'At risk';
  return 'Not ready';
}

export function countBySeverity(findings: Finding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function countByCategory(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.category] = (counts[f.category] ?? 0) + 1;
  return counts;
}
