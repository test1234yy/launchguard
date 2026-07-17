/**
 * Core domain types for the LaunchGuard scanner.
 *
 * SAFETY: scanned repository contents are always treated as untrusted DATA.
 * They are never executed, imported, installed or built — only pattern-matched.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export type Category =
  | 'secrets'
  | 'environment'
  | 'dependencies'
  | 'ci'
  | 'docker'
  | 'prisma'
  | 'nextjs'
  | 'configuration'
  | 'quality';

export const CATEGORIES: Category[] = [
  'secrets',
  'environment',
  'dependencies',
  'ci',
  'docker',
  'prisma',
  'nextjs',
  'configuration',
  'quality',
];

/** A single scanned file: repo-relative POSIX path plus decoded text content. */
export interface ScannedFile {
  path: string;
  /** UTF-8 decoded content. Binary files carry an empty string and binary=true. */
  content: string;
  /** Size of the original file in bytes. */
  size: number;
  binary: boolean;
}

/** Immutable snapshot of a project handed to the rule engine. */
export interface ProjectSnapshot {
  /** Human-readable name, e.g. "owner/repo" or the uploaded file name. */
  name: string;
  files: ScannedFile[];
  /** Signals gathered while loading that rules cannot see from files alone. */
  meta?: SnapshotMeta;
}

/**
 * Facts observed during loading that would otherwise be lost because the loader
 * drops noisy directories (node_modules, build output) before scanning.
 */
export interface SnapshotMeta {
  /** True when node_modules paths were present in the source and dropped. */
  committedNodeModules?: boolean;
}

export interface Finding {
  /** Stable unique id within a report: `${ruleId}:${n}`. */
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  category: Category;
  /** Repo-relative file path the finding points at, or "(project)" for project-level findings. */
  file: string;
  line?: number;
  /** Short, already-redacted proof of the problem. Never contains raw secrets. */
  evidence: string;
  remediation: string;
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  category: Category;
  description: string;
  /** Pure, deterministic check. Must not mutate the snapshot. */
  check(project: ProjectSnapshot): RuleMatch[];
}

/** What a rule returns; the engine turns these into full Findings. */
export interface RuleMatch {
  file: string;
  line?: number;
  evidence: string;
  /** Optional override when a rule emits variants at different severities. */
  severity?: Severity;
  remediation?: string;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ScanReport {
  id: string;
  projectName: string;
  source: { type: 'demo' | 'github' | 'zip'; ref: string };
  scannedAt: string;
  /** Wall-clock milliseconds spent evaluating rules for this report. */
  durationMs: number;
  /** Content-stable hash of findings + score (identical input ⇒ identical value). */
  fingerprint: string;
  fileCount: number;
  skippedFiles: number;
  rulesEvaluated: number;
  /** Findings hidden by the scanned project's launchguard.config.json. */
  suppressedFindings: number;
  /** File-extension breakdown of the scanned snapshot. */
  fileTypes: Record<string, number>;
  score: number;
  grade: string;
  summary: {
    total: number;
    bySeverity: SeverityCounts;
    byCategory: Record<string, number>;
  };
  findings: Finding[];
  notes: string[];
}
