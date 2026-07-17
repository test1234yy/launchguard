import type { Finding, ProjectSnapshot, ScanReport, Severity } from './types';
import { ALL_RULES } from './rules';
import { toEvidence } from './redact';
import { computeScore, countByCategory, countBySeverity, gradeFor } from './score';

/**
 * The rule engine.
 *
 * SAFETY: the engine only ever reads snapshot strings and pattern-matches
 * them. Scanned repository content is never executed, imported, installed,
 * built or treated as instructions of any kind.
 */

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export interface ScanMeta {
  source: ScanReport['source'];
  skippedFiles?: number;
  notes?: string[];
}

export function runRules(project: ProjectSnapshot): Finding[] {
  const findings: Finding[] = [];
  for (const rule of ALL_RULES) {
    let matches;
    try {
      matches = rule.check(project);
    } catch {
      // A rule crashing on hostile input must never take down the scan.
      continue;
    }
    matches.forEach((match, index) => {
      findings.push({
        id: `${rule.id}-${index + 1}`,
        ruleId: rule.id,
        title: rule.title,
        severity: match.severity ?? rule.severity,
        category: rule.category,
        file: match.file,
        line: match.line,
        evidence: toEvidence(match.evidence),
        remediation: match.remediation ?? rule.description,
      });
    });
  }
  findings.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byRule = a.ruleId.localeCompare(b.ruleId);
    if (byRule !== 0) return byRule;
    const byFile = a.file.localeCompare(b.file);
    if (byFile !== 0) return byFile;
    return (a.line ?? 0) - (b.line ?? 0);
  });
  return findings;
}

let reportCounter = 0;

export function buildReport(project: ProjectSnapshot, meta: ScanMeta): ScanReport {
  const findings = runRules(project);
  const score = computeScore(findings);
  reportCounter += 1;
  return {
    id: `scan-${Date.now().toString(36)}-${reportCounter.toString(36)}`,
    projectName: project.name,
    source: meta.source,
    scannedAt: new Date().toISOString(),
    fileCount: project.files.length,
    skippedFiles: meta.skippedFiles ?? 0,
    rulesEvaluated: ALL_RULES.length,
    score,
    grade: gradeFor(score),
    summary: {
      total: findings.length,
      bySeverity: countBySeverity(findings),
      byCategory: countByCategory(findings),
    },
    findings,
    notes: meta.notes ?? [],
  };
}
