import type { Finding, ScanReport, Severity } from '../scanner/types';
import { SEVERITIES } from '../scanner/types';

/**
 * Client-side report comparison.
 *
 * Given a baseline report and a current one, computes what changed: findings
 * that appeared, findings that were resolved, and the score movement. Pure and
 * deterministic — usable in the browser (diff two scans) and in tests.
 *
 * Findings are matched by a stable identity key (rule + file + line), not by
 * their id (which is per-run) or evidence text (which can vary).
 */

export function findingKey(finding: Pick<Finding, 'ruleId' | 'file' | 'line'>): string {
  return `${finding.ruleId}|${finding.file}|${finding.line ?? 0}`;
}

export interface SeverityDelta {
  severity: Severity;
  before: number;
  after: number;
  delta: number;
}

export interface ReportDiff {
  base: { projectName: string; score: number; fingerprint: string; scannedAt: string; total: number };
  current: { projectName: string; score: number; fingerprint: string; scannedAt: string; total: number };
  /** current.score - base.score. Positive means the project improved. */
  scoreDelta: number;
  /** True when the two reports have identical finding sets (same fingerprint). */
  identical: boolean;
  /** Findings present now but not in the baseline (regressions / newly surfaced). */
  added: Finding[];
  /** Findings present in the baseline but gone now (fixed / no longer detected). */
  removed: Finding[];
  /** Findings present in both, keyed identically. Current copy is kept. */
  unchanged: Finding[];
  /** Per-severity counts before/after with deltas, in canonical severity order. */
  bySeverity: SeverityDelta[];
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function bySeverityThenRule(a: Finding, b: Finding): number {
  const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (rank !== 0) return rank;
  const rule = a.ruleId.localeCompare(b.ruleId);
  if (rule !== 0) return rule;
  return a.file.localeCompare(b.file);
}

function severityCounts(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

/** Compare a baseline report (`base`) against a newer one (`current`). */
export function diffReports(base: ScanReport, current: ScanReport): ReportDiff {
  const baseByKey = new Map<string, Finding>();
  for (const finding of base.findings) baseByKey.set(findingKey(finding), finding);
  const currentByKey = new Map<string, Finding>();
  for (const finding of current.findings) currentByKey.set(findingKey(finding), finding);

  const added: Finding[] = [];
  const unchanged: Finding[] = [];
  for (const finding of current.findings) {
    if (baseByKey.has(findingKey(finding))) unchanged.push(finding);
    else added.push(finding);
  }
  const removed: Finding[] = [];
  for (const finding of base.findings) {
    if (!currentByKey.has(findingKey(finding))) removed.push(finding);
  }

  added.sort(bySeverityThenRule);
  removed.sort(bySeverityThenRule);
  unchanged.sort(bySeverityThenRule);

  const beforeCounts = severityCounts(base.findings);
  const afterCounts = severityCounts(current.findings);
  const bySeverity: SeverityDelta[] = SEVERITIES.map((severity) => ({
    severity,
    before: beforeCounts[severity],
    after: afterCounts[severity],
    delta: afterCounts[severity] - beforeCounts[severity],
  }));

  return {
    base: {
      projectName: base.projectName,
      score: base.score,
      fingerprint: base.fingerprint,
      scannedAt: base.scannedAt,
      total: base.findings.length,
    },
    current: {
      projectName: current.projectName,
      score: current.score,
      fingerprint: current.fingerprint,
      scannedAt: current.scannedAt,
      total: current.findings.length,
    },
    scoreDelta: current.score - base.score,
    identical: base.fingerprint === current.fingerprint,
    added,
    removed,
    unchanged,
    bySeverity,
  };
}

/** One-line human summary, handy for exports and tooltips. */
export function summarizeDiff(diff: ReportDiff): string {
  if (diff.identical) return 'No change: both scans produced identical findings.';
  const parts: string[] = [];
  const sign = diff.scoreDelta > 0 ? '+' : '';
  parts.push(`Score ${diff.base.score} → ${diff.current.score} (${sign}${diff.scoreDelta})`);
  if (diff.added.length) parts.push(`${diff.added.length} new`);
  if (diff.removed.length) parts.push(`${diff.removed.length} resolved`);
  parts.push(`${diff.unchanged.length} unchanged`);
  return parts.join(' · ');
}
