import type { ScanReport } from '@/lib/scanner/types';

/**
 * Scan history: a small, local-only record of past scans (kept in
 * localStorage) used for the "recent scans" list and score deltas.
 * Pure list operations live here so they are unit-testable; only
 * loadHistory/saveHistory touch the browser.
 */

export interface HistoryEntry {
  projectName: string;
  score: number;
  grade: string;
  fingerprint: string;
  scannedAt: string;
  findings: number;
  sourceType: string;
}

export const HISTORY_KEY = 'launchguard-history';
export const HISTORY_CAP = 10;

export function entryFromReport(report: ScanReport): HistoryEntry {
  return {
    projectName: report.projectName,
    score: report.score,
    grade: report.grade,
    fingerprint: report.fingerprint,
    scannedAt: report.scannedAt,
    findings: report.summary.total,
    sourceType: report.source.type,
  };
}

/** Prepend an entry, dropping an immediately-repeated identical scan, capped. */
export function pushHistory(list: HistoryEntry[], entry: HistoryEntry, cap = HISTORY_CAP): HistoryEntry[] {
  const deduped =
    list.length > 0 && list[0].projectName === entry.projectName && list[0].fingerprint === entry.fingerprint
      ? list.slice(1)
      : list;
  return [entry, ...deduped].slice(0, cap);
}

/** Most recent prior scan of the same project, if any. */
export function previousFor(list: HistoryEntry[], projectName: string): HistoryEntry | undefined {
  return list.find((e) => e.projectName === projectName);
}

/** Score change vs the previous scan of the same project (null when first scan). */
export function scoreDelta(list: HistoryEntry[], report: ScanReport): number | null {
  const prev = previousFor(list, report.projectName);
  if (!prev) return null;
  return report.score - prev.score;
}

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as Partial<HistoryEntry>;
  return (
    typeof e.projectName === 'string' &&
    typeof e.score === 'number' &&
    typeof e.grade === 'string' &&
    typeof e.fingerprint === 'string' &&
    typeof e.scannedAt === 'string' &&
    typeof e.findings === 'number' &&
    typeof e.sourceType === 'string'
  );
}

/** Parse a stored history payload defensively (bad entries are dropped). */
export function parseHistory(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(0, HISTORY_CAP);
  } catch {
    return [];
  }
}

export function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return parseHistory(window.localStorage.getItem(HISTORY_KEY));
  } catch {
    return [];
  }
}

export function saveHistory(list: HistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_CAP)));
  } catch {
    // Storage may be full or blocked; history is a nicety, never an error.
  }
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}
