import type { Category, Finding } from './types';
import { computeScore } from './score';

/**
 * Report insights: pure, deterministic derivations from a finding list that
 * power the "what should I fix first?" UI — remediation effort, projected
 * scores and quick wins. Everything here is computable client-side.
 */

export type Effort = 'quick' | 'moderate' | 'involved';

export const EFFORT_LABEL: Record<Effort, string> = {
  quick: 'Quick fix',
  moderate: 'Moderate',
  involved: 'Involved',
};

/** Typical remediation effort when a rule has no specific override. */
const DEFAULT_EFFORT_BY_CATEGORY: Record<Category, Effort> = {
  secrets: 'involved', // rotation + history purge
  environment: 'moderate',
  dependencies: 'quick',
  ci: 'moderate',
  docker: 'quick',
  prisma: 'moderate',
  nextjs: 'quick',
  configuration: 'quick',
  quality: 'quick',
};

/** Rules whose real-world effort differs from their category default. */
const EFFORT_OVERRIDES: Record<string, Effort> = {
  DEP001: 'moderate', // introduce a lockfile properly
  DEP003: 'moderate',
  DEP004: 'involved', // replacing a compromised package
  DOC002: 'moderate',
  DOC003: 'moderate',
  DOC006: 'moderate',
  NXT002: 'moderate', // moving a secret server-side
  CFG001: 'moderate',
  CFG003: 'involved', // untangling committed node_modules
  CFG005: 'moderate',
  QUA001: 'moderate', // resolving conflicts safely
  QUA002: 'moderate',
  QUA003: 'moderate',
  QUA008: 'moderate',
  ENV002: 'quick',
  CI003: 'quick',
  CI004: 'quick',
  ADV009: 'involved',
};

export function effortFor(ruleId: string, category: Category): Effort {
  return EFFORT_OVERRIDES[ruleId] ?? DEFAULT_EFFORT_BY_CATEGORY[category] ?? 'moderate';
}

export interface ScoreProjections {
  current: number;
  /** Score if every critical finding were fixed. */
  afterCriticals: number;
  /** Score if every critical and high finding were fixed. */
  afterCriticalsAndHighs: number;
  /** Score if every quick-fix finding were fixed. */
  afterQuickWins: number;
}

/** Deterministic "what if" scores; monotonic by construction. */
export function projectedScores(findings: Finding[]): ScoreProjections {
  return {
    current: computeScore(findings),
    afterCriticals: computeScore(findings.filter((f) => f.severity !== 'critical')),
    afterCriticalsAndHighs: computeScore(findings.filter((f) => f.severity !== 'critical' && f.severity !== 'high')),
    afterQuickWins: computeScore(findings.filter((f) => effortFor(f.ruleId, f.category) !== 'quick')),
  };
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * Low-effort findings worth doing first, deduped by rule and ordered by
 * severity. `limit` bounds the list for display.
 */
export function quickWins(findings: Finding[], limit = 5): Finding[] {
  const seen = new Set<string>();
  const wins: Finding[] = [];
  for (const finding of findings) {
    if (effortFor(finding.ruleId, finding.category) !== 'quick') continue;
    if (seen.has(finding.ruleId)) continue;
    seen.add(finding.ruleId);
    wins.push(finding);
  }
  wins.sort((a, b) => {
    const bySeverity = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (bySeverity !== 0) return bySeverity;
    return a.ruleId.localeCompare(b.ruleId);
  });
  return wins.slice(0, limit);
}

/**
 * File-extension breakdown of a snapshot: the `top` most common extensions
 * plus an "other" bucket. Extensionless files count as "(none)".
 */
export function fileTypeBreakdown(
  files: Array<{ path: string }>,
  top = 8
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const base = file.path.slice(file.path.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    const ext = dot <= 0 ? '(none)' : base.slice(dot + 1).toLowerCase();
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out: Record<string, number> = {};
  let other = 0;
  sorted.forEach(([ext, count], index) => {
    if (index < top) out[ext] = count;
    else other += count;
  });
  if (other > 0) out.other = other;
  return out;
}
